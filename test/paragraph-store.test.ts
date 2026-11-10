import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DropboxApiError,
  type DropboxClient,
  type DropboxFile,
  type DropboxFileMetadata,
  type UploadMode,
} from '../src/dropbox/client.js'
import {
  createParagraphStore,
  FeedbackConflictError,
  InvalidParagraphIdError,
  NEW_FILE_FORMAT,
  StageConflictError,
  summarizeEntries,
} from '../src/paragraphs/store.js'

/**
 * 保存層。Dropbox はメモリの中の偽物に差し替える（実 API は叩かない）。
 * 偽物は本物と同じく、パスの大文字小文字を区別せず、rev が合わない update と既存への add を 409 にする。
 */

const ROOT = '/akira/Documents/esl-writing'
const BASE = `${ROOT}/paragraphs`

interface FakeFile {
  path: string
  bytes: Buffer
  rev: string
  serverModified: string
}

function notFound(): DropboxApiError {
  return new DropboxApiError(409, 'path/not_found/..')
}

function fakeDropbox(options: { pageSize?: number } = {}) {
  const files = new Map<string, FakeFile>()
  const folders = new Map<string, string>()
  const calls: string[] = []
  let revCounter = 0
  let clock = Date.UTC(2026, 10, 8, 10, 0, 0)
  const pageSize = options.pageSize ?? 1000
  const pages = new Map<string, unknown[]>()

  const addParents = (path: string) => {
    const parts = path.split('/')
    for (let i = 2; i < parts.length; i += 1) {
      const folder = parts.slice(0, i).join('/')
      folders.set(folder.toLowerCase(), folder)
    }
  }

  function entriesUnder(path: string) {
    const prefix = `${path.toLowerCase()}/`
    const out: unknown[] = []
    for (const [lower, display] of folders) {
      if (lower.startsWith(prefix))
        out.push({
          '.tag': 'folder',
          name: display.split('/').pop(),
          path_lower: lower,
          path_display: display,
        })
    }
    for (const [lower, f] of files) {
      if (lower.startsWith(prefix)) {
        out.push({
          '.tag': 'file',
          name: f.path.split('/').pop(),
          path_lower: lower,
          path_display: f.path,
          rev: f.rev,
          size: f.bytes.length,
          server_modified: f.serverModified,
        })
      }
    }
    return out
  }

  function page(all: unknown[]) {
    const head = all.slice(0, pageSize)
    const rest = all.slice(pageSize)
    const cursor = `c${pages.size}`
    pages.set(cursor, rest)
    return { entries: head, cursor, has_more: rest.length > 0 }
  }

  const client: DropboxClient = {
    async rpc<T>(endpoint: string, body?: unknown): Promise<T> {
      calls.push(endpoint)
      const arg = body as { path?: string; cursor?: string }
      if (endpoint === '/2/files/list_folder') {
        const path = arg.path ?? ''
        if (!folders.has(path.toLowerCase())) throw notFound()
        return page(entriesUnder(path)) as T
      }
      if (endpoint === '/2/files/list_folder/continue') {
        const rest = pages.get(arg.cursor ?? '')
        if (rest === undefined) throw new Error('cursor が不正')
        return page(rest) as T
      }
      throw new Error(`想定していない RPC: ${endpoint}`)
    },
    async download(path: string): Promise<DropboxFile> {
      calls.push(`download ${path}`)
      const f = files.get(path.toLowerCase())
      if (f === undefined) throw notFound()
      return {
        rev: f.rev,
        path: f.path,
        serverModified: f.serverModified,
        size: f.bytes.length,
        bytes: f.bytes,
      }
    },
    async upload(path: string, bytes: Uint8Array, mode: UploadMode): Promise<DropboxFileMetadata> {
      calls.push(`upload ${path} ${mode.tag === 'add' ? 'add' : `update:${mode.rev}`}`)
      const existing = files.get(path.toLowerCase())
      if (mode.tag === 'add' ? existing !== undefined : existing?.rev !== mode.rev) {
        throw new DropboxApiError(409, 'path/conflict/file/..')
      }
      addParents(path)
      revCounter += 1
      clock += 60_000
      const f = {
        path,
        bytes: Buffer.from(bytes),
        rev: `rev${revCounter}`,
        serverModified: new Date(clock).toISOString().replace('.000', ''),
      }
      files.set(path.toLowerCase(), f)
      return { rev: f.rev, path, serverModified: f.serverModified, size: f.bytes.length }
    },
    async createFolder(path: string): Promise<string> {
      calls.push(`createFolder ${path}`)
      if (folders.has(path.toLowerCase())) throw new DropboxApiError(409, 'path/conflict/folder/..')
      addParents(`${path}/x`)
      return path
    },
    async remove(path: string, rev?: string): Promise<void> {
      calls.push(`remove ${path}${rev === undefined ? '' : ` ${rev}`}`)
      const lower = path.toLowerCase()
      if (!folders.has(lower) && !files.has(lower))
        throw new DropboxApiError(409, 'path_lookup/not_found/..')
      for (const key of [...files.keys()])
        if (key === lower || key.startsWith(`${lower}/`)) files.delete(key)
      for (const key of [...folders.keys()])
        if (key === lower || key.startsWith(`${lower}/`)) folders.delete(key)
    },
    async accessToken() {
      return 'token'
    },
  }
  return { client, files, folders, calls }
}

describe('createParagraphStore', () => {
  it('まだ何も無ければ一覧は空（paragraphs/ が無くてもエラーにしない）', async () => {
    const { client } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    assert.deepEqual(await store.listParagraphs(), [])
  })

  it('新規作成はフォルダだけを作り、空のファイルは作らない', async () => {
    const { client, files, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'Should students wear school uniforms?')
    assert.equal(id, '2026-11-08-should-students-wear-school-uniforms')
    assert.deepEqual(calls, [`createFolder ${BASE}/${id}`])
    assert.equal(files.size, 0)

    const [summary] = await store.listParagraphs()
    assert.equal(summary?.id, id)
    assert.equal(summary?.createdOn, '2026-11-08')
    assert.equal(summary?.updatedAt, '2026-11-08T00:00:00Z')
    assert.deepEqual(summary?.files, {})
    assert.deepEqual(summary?.started, {
      assignment: false,
      outline: false,
      draft: false,
    })
  })

  it('同名のフォルダがあれば -2, -3 を付ける（autorename に頼らない）', async () => {
    const { client } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    assert.equal(await store.createParagraph('2026-11-08', 'Homework'), '2026-11-08-homework')
    assert.equal(await store.createParagraph('2026-11-08', 'Homework'), '2026-11-08-homework-2')
    assert.equal(await store.createParagraph('2026-11-08', 'homework!'), '2026-11-08-homework-3')
  })

  it('無いファイルを読むと空文字・rev なし。保存は add になる', async () => {
    const { client, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    const empty = await store.readStage(id, 'draft')
    assert.deepEqual(empty, { text: '', rev: null, format: NEW_FILE_FORMAT })

    const saved = await store.saveStage(id, 'draft', 'In my opinion, ...', empty)
    assert.equal(calls.at(-1), `upload ${BASE}/${id}/draft.txt add`)
    const again = await store.readStage(id, 'draft')
    assert.equal(again.text, 'In my opinion, ...')
    assert.equal(again.rev, saved.rev)
  })

  it('2 回目からは読んだときの rev で update する', async () => {
    const { client, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    const first = await store.saveStage(id, 'outline', '制服', {
      rev: null,
      format: NEW_FILE_FORMAT,
    })
    const second = await store.saveStage(id, 'outline', '制服\n\tお金', {
      rev: first.rev,
      format: NEW_FILE_FORMAT,
    })
    assert.equal(calls.at(-1), `upload ${BASE}/${id}/outline.txt update:${first.rev}`)
    assert.notEqual(second.rev, first.rev)
  })

  it('feedback.json: 無ければ null、add で書き、読んだ rev で update。合わなければ FeedbackConflictError', async () => {
    const { client, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    assert.equal(await store.readFeedback(id), null)
    await store.saveFeedback(id, '{"version":1}\n', null)
    assert.equal(calls.at(-1), `upload ${BASE}/${id}/feedback.json add`)
    const first = await store.readFeedback(id)
    assert.equal(first?.text, '{"version":1}\n')
    await store.saveFeedback(id, '{"version":1,"x":2}\n', first?.rev ?? null)
    assert.equal(calls.at(-1), `upload ${BASE}/${id}/feedback.json update:${first?.rev}`)
    await assert.rejects(store.saveFeedback(id, '{}', first?.rev ?? null), FeedbackConflictError)
    await assert.rejects(store.saveFeedback(id, '{}', null), FeedbackConflictError)
    await assert.rejects(store.readFeedback('../x'), InvalidParagraphIdError)
  })

  it('rev が合わなければ上書きせず StageConflictError（他の端末が先に保存した）', async () => {
    const { client } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    const opened = await store.readStage(id, 'draft')
    const mine = await store.saveStage(id, 'draft', 'v1', opened)
    // 別の端末が同じ rev から保存した
    await store.saveStage(id, 'draft', 'other device', { rev: mine.rev, format: NEW_FILE_FORMAT })

    await assert.rejects(
      store.saveStage(id, 'draft', 'v2', { rev: mine.rev, format: NEW_FILE_FORMAT }),
      (error: unknown) => {
        assert.ok(error instanceof StageConflictError)
        assert.equal(error.stage, 'draft')
        return true
      },
    )
    assert.equal((await store.readStage(id, 'draft')).text, 'other device')
  })

  it('rev なしで保存しようとしたら既にあった、も StageConflictError', async () => {
    const { client } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    await store.saveStage(id, 'outline', 'x', { rev: null, format: NEW_FILE_FORMAT })
    await assert.rejects(
      store.saveStage(id, 'outline', 'y', { rev: null, format: NEW_FILE_FORMAT }),
      StageConflictError,
    )
  })

  it('読んだときの形式（CRLF・末尾の改行）で書き戻す', async () => {
    const { client, files } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    // 他のエディタで CRLF・末尾の改行ありで保存された outline.txt
    await client.upload(`${BASE}/${id}/outline.txt`, Buffer.from('意見\r\n\t理由\r\n'), {
      tag: 'add',
    })
    const opened = await store.readStage(id, 'outline')
    assert.equal(opened.text, '意見\n\t理由\n')
    assert.deepEqual(opened.format, { eol: 'crlf', bom: false, finalNewline: true })

    await store.saveStage(id, 'outline', '意見\n\t理由\n\t\t例', opened)
    const stored = files.get(`${BASE}/${id}/outline.txt`.toLowerCase())
    assert.equal(stored?.bytes.toString('utf8'), '意見\r\n\t理由\r\n\t\t例\r\n')
  })

  it('一覧: 段階ごとのファイルと着手済み（1 バイト以上）、更新日はファイルの最新', async () => {
    const { client } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const a = await store.createParagraph('2026-11-01', 'Older')
    const b = await store.createParagraph('2026-11-08', 'Newer')
    await store.saveStage(b, 'assignment', '# Newer', { rev: null, format: NEW_FILE_FORMAT })
    await store.saveStage(a, 'assignment', '# Older', { rev: null, format: NEW_FILE_FORMAT })
    await store.saveStage(a, 'outline', '', { rev: null, format: NEW_FILE_FORMAT })

    const list = await store.listParagraphs()
    // a のほうが後に保存したので先に来る
    assert.deepEqual(
      list.map((p) => p.id),
      [a, b],
    )
    const first = list[0]
    assert.deepEqual(first?.started, {
      assignment: true,
      outline: false,
      draft: false,
    })
    assert.equal(first?.files.outline?.size, 0)
    assert.equal(first?.updatedAt, first?.files.outline?.serverModified)
  })

  it('一覧: has_more が無くなるまで list_folder/continue で辿る', async () => {
    const { client, calls } = fakeDropbox({ pageSize: 2 })
    const store = createParagraphStore(client, ROOT)
    for (const theme of ['a', 'b', 'c']) {
      const id = await store.createParagraph('2026-11-08', theme)
      await store.saveStage(id, 'draft', theme, { rev: null, format: NEW_FILE_FORMAT })
    }
    const list = await store.listParagraphs()
    assert.equal(list.length, 3)
    assert.ok(list.every((p) => p.started.draft))
    assert.ok(calls.filter((c) => c === '/2/files/list_folder/continue').length >= 2)
  })

  it('削除はフォルダごと消す（rev は付けない）。既に無くてもエラーにしない', async () => {
    const { client, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    const id = await store.createParagraph('2026-11-08', 'a')
    await store.saveStage(id, 'draft', 'x', { rev: null, format: NEW_FILE_FORMAT })
    await store.deleteParagraph(id)
    assert.equal(calls.at(-1), `remove ${BASE}/${id}`)
    assert.deepEqual(await store.listParagraphs(), [])
    await store.deleteParagraph(id)
  })

  it('id の形でなければ Dropbox に触る前に断る（パスを抜け出させない）', async () => {
    const { client, calls } = fakeDropbox()
    const store = createParagraphStore(client, ROOT)
    for (const bad of ['../secret', '2026-11-08-a/../../x', 'notes']) {
      await assert.rejects(store.readStage(bad, 'draft'), InvalidParagraphIdError)
      await assert.rejects(
        store.saveStage(bad, 'draft', 'x', { rev: null, format: NEW_FILE_FORMAT }),
        InvalidParagraphIdError,
      )
      await assert.rejects(store.deleteParagraph(bad), InvalidParagraphIdError)
    }
    assert.deepEqual(calls, [])
  })
})

describe('summarizeEntries', () => {
  it('id の形でないフォルダ・段階以外のファイル・深い階層・外のパスは無視する', () => {
    const entries = [
      {
        '.tag': 'folder',
        path_lower: `${BASE}/2026-11-08-a`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a`,
      },
      { '.tag': 'folder', path_lower: `${BASE}/memo`.toLowerCase(), path_display: `${BASE}/memo` },
      {
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/notes.txt`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/notes.txt`,
        rev: 'r1',
        size: 3,
      },
      {
        // なくした段階のファイル（2026-11-09 まで）。残っていても段階にも更新日にも数えない
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/ideas.txt`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/ideas.txt`,
        rev: 'r5',
        size: 9,
        server_modified: '2026-11-09T09:00:00Z',
      },
      {
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/old/draft.txt`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/old/draft.txt`,
        rev: 'r2',
        size: 3,
      },
      {
        '.tag': 'file',
        path_lower: `${ROOT}/draft.txt`.toLowerCase(),
        path_display: `${ROOT}/draft.txt`,
        rev: 'r3',
        size: 3,
      },
      {
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/Draft.TXT`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/Draft.TXT`,
        rev: 'r4',
        size: 5,
        server_modified: '2026-11-08T12:00:00Z',
      },
    ]
    const list = summarizeEntries(BASE, entries)
    assert.equal(list.length, 1)
    assert.deepEqual(list[0]?.files, {
      draft: { rev: 'r4', size: 5, serverModified: '2026-11-08T12:00:00Z' },
    })
    assert.equal(list[0]?.updatedAt, '2026-11-08T12:00:00Z')
  })

  it('feedback.json は feedback に入れ、段階にも更新日にも数えない', () => {
    const list = summarizeEntries(BASE, [
      {
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/draft.txt`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/draft.txt`,
        rev: 'd1',
        size: 5,
        server_modified: '2026-11-08T10:00:00Z',
      },
      {
        '.tag': 'file',
        path_lower: `${BASE}/2026-11-08-a/feedback.json`.toLowerCase(),
        path_display: `${BASE}/2026-11-08-a/feedback.json`,
        rev: 'f1',
        size: 300,
        server_modified: '2026-11-08T11:00:00Z',
      },
    ])
    assert.deepEqual(list[0]?.feedback, {
      rev: 'f1',
      size: 300,
      serverModified: '2026-11-08T11:00:00Z',
    })
    assert.deepEqual(Object.keys(list[0]?.files ?? {}), ['draft'])
    assert.equal(list[0]?.updatedAt, '2026-11-08T10:00:00Z')
  })
})
