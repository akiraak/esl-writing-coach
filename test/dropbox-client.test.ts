import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { DropboxSettings } from '../src/config.js'
import {
  apiArgHeader,
  createDropboxClient,
  DropboxApiError,
  DropboxAuthError,
  DropboxResponseError,
  type FetchLike,
  isConflictError,
  isNotFoundError,
} from '../src/dropbox/client.js'
import { clearSecrets } from '../src/log.js'

/**
 * Dropbox クライアント（daily-note のテストを移植）。実 API は叩かず fetch を差し替える。
 * 「失効しても自動で回復する」「秘密が例外に載らない」の 2 つが要点。
 */

const SETTINGS: DropboxSettings = {
  appKey: 'app-key-value',
  appSecret: 'app-secret-value-1234',
  refreshToken: 'refresh-token-value-5678',
  root: '/akira/Documents/esl-writing',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function tokenResponse(accessToken: string, expiresIn = 14400): Response {
  return jsonResponse({ access_token: accessToken, expires_in: expiresIn, token_type: 'bearer' })
}

interface Call {
  url: string
  init: RequestInit | undefined
}

function fakeFetch(responses: Array<(call: Call) => Response>) {
  const calls: Call[] = []
  const impl: FetchLike = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    const handler = responses[calls.length - 1]
    if (handler === undefined) throw new Error(`想定していない呼び出しです: ${url}`)
    return handler(call)
  }
  return { impl, calls }
}

function headerOf(call: Call | undefined, name: string): string | undefined {
  const headers = call?.init?.headers as Record<string, string> | undefined
  return headers?.[name]
}

beforeEach(() => {
  clearSecrets()
})

describe('createDropboxClient', () => {
  it('最初の呼び出しでアクセストークンを取り、Bearer を付けて RPC する', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ entries: [], has_more: false }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    const result = await client.rpc<{ has_more: boolean }>('/2/files/list_folder', { path: '' })
    assert.equal(result.has_more, false)

    // 1 回目: refresh token でアクセストークンを取る（app key/secret は Basic 認証）
    assert.equal(calls[0]?.url, 'https://api.dropbox.com/oauth2/token')
    const expected = `Basic ${Buffer.from('app-key-value:app-secret-value-1234').toString('base64')}`
    assert.equal(headerOf(calls[0], 'authorization'), expected)
    assert.match(String(calls[0]?.init?.body), /grant_type=refresh_token/)

    // 2 回目: RPC 本体
    assert.equal(calls[1]?.url, 'https://api.dropboxapi.com/2/files/list_folder')
    assert.equal(headerOf(calls[1], 'authorization'), 'Bearer access-1')
    assert.equal(headerOf(calls[1], 'content-type'), 'application/json')
    assert.equal(calls[1]?.init?.body, '{"path":""}')
  })

  it('有効なうちはアクセストークンを使い回す（毎回取り直さない）', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ ok: 1 }),
      () => jsonResponse({ ok: 2 }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.rpc('/2/files/list_folder', {})
    await client.rpc('/2/files/list_folder', {})
    assert.equal(calls.length, 3)
    assert.equal(headerOf(calls[2], 'authorization'), 'Bearer access-1')
  })

  it('期限が近づいたら先回りして取り直す（4 時間で失効するため）', async () => {
    let clock = 0
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1', 14400),
      () => jsonResponse({ ok: 1 }),
      () => tokenResponse('access-2', 14400),
      () => jsonResponse({ ok: 2 }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl, now: () => clock })
    await client.rpc('/2/files/list_folder', {})
    // 残り 4 分（余裕 5 分を切る）まで進める
    clock = (14400 - 240) * 1000
    await client.rpc('/2/files/list_folder', {})
    assert.equal(calls.length, 4)
    assert.equal(headerOf(calls[3], 'authorization'), 'Bearer access-2')
  })

  it('401 が返ったら 1 回だけ取り直して再送する', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'expired_access_token/' }, 401),
      () => tokenResponse('access-2'),
      () => jsonResponse({ entries: [] }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.rpc('/2/files/list_folder', {})
    assert.equal(calls.length, 4)
    assert.equal(headerOf(calls[1], 'authorization'), 'Bearer access-1')
    assert.equal(headerOf(calls[3], 'authorization'), 'Bearer access-2')
  })

  it('取り直しても 401 なら諦める（無限に繰り返さない）', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'invalid_access_token/' }, 401),
      () => tokenResponse('access-2'),
      () => jsonResponse({ error_summary: 'invalid_access_token/' }, 401),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.rpc('/2/files/list_folder', {}), (error: unknown) => {
      assert.ok(error instanceof DropboxApiError)
      assert.equal(error.status, 401)
      return true
    })
    assert.equal(calls.length, 4)
  })

  it('API エラーは error_summary を残す（Phase 4 の競合検出で分岐に使う）', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'path/conflict/file/...' }, 409),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.rpc('/2/files/upload', {}), (error: unknown) => {
      assert.ok(error instanceof DropboxApiError)
      assert.equal(error.status, 409)
      assert.equal(error.errorSummary, 'path/conflict/file/...')
      return true
    })
  })

  it('トークンの更新に失敗したら DropboxAuthError にする', async () => {
    const { impl } = fakeFetch([
      () =>
        jsonResponse(
          { error: 'invalid_grant', error_description: '認可が取り消されています' },
          400,
        ),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.rpc('/2/files/list_folder', {}), DropboxAuthError)
  })

  it('例外に app secret と refresh token を載せない', async () => {
    const { impl } = fakeFetch([
      // 応答に秘密が混ざっていても伏せられることを確かめる
      () => new Response(`invalid refresh_token: ${SETTINGS.refreshToken}`, { status: 400 }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.rpc('/2/files/list_folder', {}), (error: unknown) => {
      const message = (error as Error).message
      assert.doesNotMatch(message, /refresh-token-value-5678/)
      assert.doesNotMatch(message, /app-secret-value-1234/)
      assert.match(message, /\*\*\*/)
      return true
    })
  })

  it('body を渡さなければ content-type も付けない（引数不要の API 用）', async () => {
    const { impl, calls } = fakeFetch([() => tokenResponse('access-1'), () => jsonResponse({})])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.rpc('/2/users/get_current_account')
    assert.equal(headerOf(calls[1], 'content-type'), undefined)
    assert.equal(calls[1]?.init?.body, undefined)
  })

  it('download は本文のバイト列と rev を返す', async () => {
    const body = Buffer.from('TODO:\r\n\t> 灯油を買う\r\n', 'utf8')
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () =>
        new Response(body, {
          headers: {
            'dropbox-api-result': JSON.stringify({
              name: '2026-09-03.txt',
              path_display: '/akira/Documents/esl-writing/paragraphs/2026-11-08-a/draft.txt',
              rev: '0123456789abcdef',
              size: body.length,
              server_modified: '2026-09-03T12:00:00Z',
            }),
          },
        }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    const file = await client.download(
      '/akira/Documents/esl-writing/paragraphs/2026-11-08-a/draft.txt',
    )

    assert.equal(calls[1]?.url, 'https://content.dropboxapi.com/2/files/download')
    assert.equal(headerOf(calls[1], 'authorization'), 'Bearer access-1')
    assert.equal(
      headerOf(calls[1], 'dropbox-api-arg'),
      '{"path":"/akira/Documents/esl-writing/paragraphs/2026-11-08-a/draft.txt"}',
    )
    // バイト列のまま返す（文字コードの解釈はしない）
    assert.deepEqual(file.bytes, body)
    assert.equal(file.rev, '0123456789abcdef')
    assert.equal(file.path, '/akira/Documents/esl-writing/paragraphs/2026-11-08-a/draft.txt')
    assert.equal(file.serverModified, '2026-09-03T12:00:00Z')
  })

  it('download も 401 なら取り直して再送する', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'expired_access_token/' }, 401),
      () => tokenResponse('access-2'),
      () => new Response('TODO:\n', { headers: { 'dropbox-api-result': '{"rev":"rev-1"}' } }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    assert.equal((await client.download('/x/2026-09-03.txt')).rev, 'rev-1')
    assert.equal(calls.length, 4)
    assert.equal(headerOf(calls[3], 'authorization'), 'Bearer access-2')
  })

  it('rev が取れなければ諦める（競合を検出できないまま編集させない）', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => new Response('TODO:\n', { headers: { 'dropbox-api-result': '{"name":"x.txt"}' } }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.download('/x/2026-09-03.txt'), DropboxResponseError)
  })

  it('無いファイルの download は error_summary を残す', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'path/not_found/...' }, 409),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.download('/x/none.txt'), (error: unknown) => {
      assert.ok(error instanceof DropboxApiError)
      assert.equal(error.errorSummary, 'path/not_found/...')
      return true
    })
  })

  it('upload は mode=update と rev を渡す（overwrite は使わない）', async () => {
    const body = Buffer.from('TODO:\r\n', 'utf8')
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ rev: 'rev-2', path_display: '/x/2026-09-03.txt', size: body.length }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    const meta = await client.upload('/x/2026-09-03.txt', body, { tag: 'update', rev: 'rev-1' })

    assert.equal(calls[1]?.url, 'https://content.dropboxapi.com/2/files/upload')
    assert.equal(headerOf(calls[1], 'content-type'), 'application/octet-stream')
    assert.deepEqual(JSON.parse(headerOf(calls[1], 'dropbox-api-arg') ?? '{}'), {
      path: '/x/2026-09-03.txt',
      mode: { '.tag': 'update', update: 'rev-1' },
      autorename: false,
      strict_conflict: true,
    })
    assert.equal(calls[1]?.init?.body, body)
    assert.equal(meta.rev, 'rev-2')
    assert.equal(meta.size, body.length)
  })

  it('upload の add は文字列の mode で渡す（新規作成）', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ rev: 'rev-1', path_display: '/x/2026-09-06.txt', size: 0 }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.upload('/x/2026-09-06.txt', new Uint8Array(0), { tag: 'add' })
    assert.deepEqual(JSON.parse(headerOf(calls[1], 'dropbox-api-arg') ?? '{}').mode, 'add')
  })

  it('rev が合わなければ 409 の competing エラーになる（isConflictError で見分ける）', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'path/conflict/file/...' }, 409),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(
      client.upload('/x/2026-09-03.txt', new Uint8Array(0), { tag: 'update', rev: 'old' }),
      (error: unknown) => {
        assert.ok(isConflictError(error))
        return true
      },
    )
  })

  it('isConflictError は競合以外を拾わない', () => {
    assert.equal(isConflictError(new DropboxApiError(409, 'path/insufficient_space/...')), false)
    assert.equal(isConflictError(new DropboxApiError(500, 'path/conflict/file/...')), false)
    assert.equal(isConflictError(new Error('conflict')), false)
  })

  it('upload の応答に rev が無ければ諦める', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ name: '2026-09-03.txt' }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(
      client.upload('/x/2026-09-03.txt', new Uint8Array(0), { tag: 'add' }),
      DropboxResponseError,
    )
  })

  it('accessToken() は content エンドポイント用に有効なトークンを返す', async () => {
    const { impl } = fakeFetch([() => tokenResponse('access-1')])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    assert.equal(await client.accessToken(), 'access-1')
    // 2 回目は取り直さない（呼び出しを 1 つしか用意していないので、増えれば例外になる）
    assert.equal(await client.accessToken(), 'access-1')
  })
})

describe('apiArgHeader', () => {
  it('日本語のファイル名を \\uXXXX に逃がす（HTTP ヘッダには ASCII しか置けない）', () => {
    const header = apiArgHeader({ path: '/esl-writing/paragraphs/2026-11-08-制服/draft.txt' })
    assert.match(header, /^[\x20-\x7e]*$/)
    assert.deepEqual(JSON.parse(header), {
      path: '/esl-writing/paragraphs/2026-11-08-制服/draft.txt',
    })
  })

  it('ASCII だけならそのまま', () => {
    assert.equal(
      apiArgHeader({ path: '/esl-writing/paragraphs/2026-11-08-a/draft.txt' }),
      '{"path":"/esl-writing/paragraphs/2026-11-08-a/draft.txt"}',
    )
  })
})

describe('createFolder（パラグラフのフォルダを作る）', () => {
  it('create_folder_v2 に path を渡し、autorename はしない。実パスを返す', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () =>
        jsonResponse({
          metadata: {
            '.tag': 'folder',
            path_display: '/x/paragraphs/2026-11-08-a',
            path_lower: '/x/paragraphs/2026-11-08-a',
          },
        }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    const path = await client.createFolder('/x/paragraphs/2026-11-08-a')
    assert.equal(calls[1]?.url, 'https://api.dropboxapi.com/2/files/create_folder_v2')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      path: '/x/paragraphs/2026-11-08-a',
      autorename: false,
    })
    assert.equal(path, '/x/paragraphs/2026-11-08-a')
  })

  it('既にあれば 409 の path/conflict（isConflictError で見分ける）', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'path/conflict/folder/..' }, 409),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.createFolder('/x/a'), (error: unknown) => {
      assert.equal(isConflictError(error), true)
      return true
    })
  })

  it('応答にパスが無ければ DropboxResponseError', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ metadata: {} }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.createFolder('/x/a'), DropboxResponseError)
  })
})

describe('remove', () => {
  it('delete_v2 に path と parent_rev を渡す（他で更新されていれば Dropbox が断る）', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () =>
        jsonResponse({
          metadata: { '.tag': 'file', rev: 'rev-3', path_display: '/x/a.txt', size: 1 },
        }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.remove('/x/a.txt', 'rev-3')
    assert.equal(calls[1]?.url, 'https://api.dropboxapi.com/2/files/delete_v2')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      path: '/x/a.txt',
      parent_rev: 'rev-3',
    })
  })

  it('rev を渡さなければ parent_rev を付けない（フォルダごと消すとき）', async () => {
    const { impl, calls } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ metadata: { '.tag': 'folder', path_display: '/x/p' } }),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await client.remove('/x/p')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { path: '/x/p' })
  })

  it('既に無ければ 409 の path_lookup/not_found（isNotFoundError で見分ける）', async () => {
    const { impl } = fakeFetch([
      () => tokenResponse('access-1'),
      () => jsonResponse({ error_summary: 'path_lookup/not_found/..' }, 409),
    ])
    const client = createDropboxClient(SETTINGS, { fetch: impl })
    await assert.rejects(client.remove('/x/a.txt', 'rev-1'), (error: unknown) => {
      assert.equal(isNotFoundError(error), true)
      assert.equal(isConflictError(error), false)
      return true
    })
  })
})
