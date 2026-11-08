import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  InvalidParagraphIdError,
  NEW_FILE_FORMAT,
  type ParagraphStore,
  type ParagraphSummary,
  type SaveBase,
  type Stage,
  StageConflictError,
} from '../src/paragraphs/store.js'
import { CONTENT_SECURITY_POLICY } from '../src/server/guard.js'
import { createAppHandler, listen } from '../src/server/server.js'

/**
 * サーバを空きポートで立て、`fetch` で叩く。保存層は偽物（Dropbox は叩かない）。
 * Host のチェックはポートまで見るので、立てたあとのポートを handler に渡す。
 */

interface Call {
  op: string
  args: unknown[]
}

function fakeStore() {
  const calls: Call[] = []
  const texts = new Map<string, { text: string; rev: string }>()
  let revs = 0
  const check = (id: string) => {
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) throw new InvalidParagraphIdError(id)
  }
  const store: ParagraphStore = {
    async listParagraphs(): Promise<ParagraphSummary[]> {
      calls.push({ op: 'list', args: [] })
      return [
        {
          id: '2026-11-08-a',
          createdOn: '2026-11-08',
          updatedAt: '2026-11-08T01:00:00Z',
          files: {},
          started: { assignment: false, ideas: false, outline: false, draft: false },
        },
      ]
    },
    async readStage(id: string, stage: Stage) {
      check(id)
      calls.push({ op: 'read', args: [id, stage] })
      const got = texts.get(`${id}/${stage}`)
      return got === undefined
        ? { text: '', rev: null, format: NEW_FILE_FORMAT }
        : { text: got.text, rev: got.rev, format: NEW_FILE_FORMAT }
    },
    async saveStage(id: string, stage: Stage, text: string, base: SaveBase) {
      check(id)
      calls.push({ op: 'save', args: [id, stage, text, base] })
      const key = `${id}/${stage}`
      if ((texts.get(key)?.rev ?? null) !== base.rev) throw new StageConflictError(id, stage)
      revs += 1
      texts.set(key, { text, rev: `r${revs}` })
      return { rev: `r${revs}`, size: text.length, serverModified: '2026-11-08T02:00:00Z' }
    },
    async createParagraph(date: string, theme: string) {
      calls.push({ op: 'create', args: [date, theme] })
      return `${date}-new`
    },
    async deleteParagraph(id: string) {
      check(id)
      calls.push({ op: 'delete', args: [id] })
    },
  }
  return { store, calls }
}

let server: Server
let base: string
let port: number
let fake: ReturnType<typeof fakeStore>
let webDir: string

before(async () => {
  webDir = await mkdtemp(path.join(tmpdir(), 'esl-web-'))
  await writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>t</title>')
  await writeFile(path.join(webDir, 'style.css'), 'body{}')
  await writeFile(path.join(webDir, 'app.js'), 'console.log(1)')
  // ポートは立ててから分かるので、handler は毎回そのポートで作り直す
  let handler: ReturnType<typeof createAppHandler> | null = null
  server = await listen((req, res) => handler?.(req, res), 0, '127.0.0.1')
  port = (server.address() as AddressInfo).port
  base = `http://127.0.0.1:${port}`
  handler = (req, res) =>
    createAppHandler({
      port,
      store: fake.store,
      webDir,
      bundleDir: webDir,
      today: () => '2026-11-08',
    })(req, res)
})

after(() => {
  server.close()
})

beforeEach(() => {
  fake = fakeStore()
})

const WRITE = { 'content-type': 'application/json', 'x-esl-request': '1' }

describe('API', () => {
  it('GET /api/paragraphs は一覧', async () => {
    const res = await fetch(`${base}/api/paragraphs`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { paragraphs: ParagraphSummary[] }
    assert.equal(body.paragraphs[0]?.id, '2026-11-08-a')
  })

  it('POST /api/paragraphs はサーバの今日の日付で作り、テーマ入りの assignment.md を書く（前後の空白は落とす）', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: '  School uniforms ' }),
    })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { id: '2026-11-08-new' })
    assert.deepEqual(fake.calls, [
      { op: 'create', args: ['2026-11-08', 'School uniforms'] },
      {
        op: 'save',
        args: [
          '2026-11-08-new',
          'assignment',
          '# School uniforms\n\n- 語数:\n- 文数:\n\n## 条件\n',
          { rev: null, format: NEW_FILE_FORMAT },
        ],
      },
    ])
  })

  it('POST のテーマが文字列でなければ 400', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: 1 }),
    })
    assert.equal(res.status, 400)
    assert.equal(fake.calls.length, 0)
  })

  it('段階のファイルを読み、rev を付けて保存し、古い rev なら 409', async () => {
    const url = `${base}/api/paragraphs/2026-11-08-a/stages/draft`
    const opened = (await (await fetch(url)).json()) as { text: string; rev: string | null }
    assert.deepEqual(opened, { text: '', rev: null, format: NEW_FILE_FORMAT })

    const put = (rev: string | null, text: string) =>
      fetch(url, {
        method: 'PUT',
        headers: WRITE,
        body: JSON.stringify({ text, rev, format: NEW_FILE_FORMAT }),
      })
    const first = await put(null, 'In my opinion')
    assert.equal(first.status, 200)
    const saved = (await first.json()) as { rev: string }
    assert.equal(saved.rev, 'r1')

    const second = await put('r1', 'In my opinion, ...')
    assert.equal(second.status, 200)

    const stale = await put('r1', 'stale')
    assert.equal(stale.status, 409)
    assert.equal(((await stale.json()) as { error: string }).error, 'conflict')
  })

  it('PUT の本文・rev・format が不正なら 400（保存層に渡さない）', async () => {
    const url = `${base}/api/paragraphs/2026-11-08-a/stages/draft`
    for (const body of [
      { rev: null, format: NEW_FILE_FORMAT },
      { text: 'x', rev: '', format: NEW_FILE_FORMAT },
      { text: 'x', rev: null, format: { eol: 'cr', bom: false, finalNewline: false } },
    ]) {
      const res = await fetch(url, { method: 'PUT', headers: WRITE, body: JSON.stringify(body) })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    const bad = await fetch(url, { method: 'PUT', headers: WRITE, body: '{' })
    assert.equal(bad.status, 400)
    assert.equal(fake.calls.length, 0)
  })

  it('知らない段階・不正な id は 400', async () => {
    assert.equal((await fetch(`${base}/api/paragraphs/2026-11-08-a/stages/notes`)).status, 400)
    assert.equal((await fetch(`${base}/api/paragraphs/..%2Fsecret/stages/draft`)).status, 400)
  })

  it('DELETE /api/paragraphs/:id は 204', async () => {
    const res = await fetch(`${base}/api/paragraphs/2026-11-08-a`, {
      method: 'DELETE',
      headers: WRITE,
    })
    assert.equal(res.status, 204)
    assert.deepEqual(fake.calls, [{ op: 'delete', args: ['2026-11-08-a'] }])
  })

  it('書き込みに X-ESL-Request が無ければ 403（別のサイトから送らせない）', async () => {
    const res = await fetch(`${base}/api/paragraphs/2026-11-08-a`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(res.status, 403)
    assert.equal(fake.calls.length, 0)
  })

  it('知らない API は 404、使えないメソッドは 405', async () => {
    assert.equal((await fetch(`${base}/api/nothing`)).status, 404)
    assert.equal(
      (await fetch(`${base}/api/paragraphs`, { method: 'PUT', headers: WRITE, body: '{}' })).status,
      405,
    )
  })
})

describe('画面のファイル', () => {
  it('/ は index.html を CSP 付きで返す', async () => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    assert.equal(res.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY)
    assert.match(await res.text(), /<!doctype html>/)
  })

  it('/style.css と /app.js を返し、ほかは 404', async () => {
    assert.equal((await fetch(`${base}/style.css`)).status, 200)
    assert.equal((await fetch(`${base}/app.js`)).status, 200)
    assert.equal((await fetch(`${base}/../.env`)).status, 404)
    assert.equal((await fetch(`${base}/package.json`)).status, 404)
  })
})
