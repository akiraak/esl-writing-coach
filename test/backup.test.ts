import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import {
  DropboxApiError,
  type DropboxClient,
  type DropboxFileMetadata,
  type UploadMode,
} from '../src/dropbox/client.js'
import {
  backupFileName,
  backupIfChanged,
  backupNow,
  backupsToDelete,
} from '../src/paragraphs/backup.js'
import { openDatabase } from '../src/paragraphs/database.js'
import { createParagraphStore } from '../src/paragraphs/store.js'

/** Dropbox のバックアップ。Dropbox はメモリの中の偽物（add で同名があれば 409、update は rev が合えば上書き）。 */
function fakeDropbox(existing: string[] = []) {
  const files = new Map<string, { bytes: Uint8Array; rev: string }>()
  for (const name of existing) files.set(name, { bytes: new Uint8Array(), rev: 'old' })
  const ops: string[] = []
  let revs = 0
  const conflict = () => new DropboxApiError(409, 'path/conflict/file/..')
  const client: DropboxClient = {
    async rpc<T>(endpoint: string, body?: unknown): Promise<T> {
      const arg = body as { path: string }
      ops.push(`${endpoint} ${arg.path}`)
      if (endpoint === '/2/files/get_metadata') return { rev: files.get(arg.path)?.rev } as T
      if (endpoint === '/2/files/list_folder') {
        const entries = [...files.keys()]
          .filter((p) => p.startsWith(`${arg.path}/`))
          .map((p) => ({ '.tag': 'file', name: p.slice(arg.path.length + 1) }))
        return { entries, cursor: 'c', has_more: false } as T
      }
      throw new Error(`知らない endpoint: ${endpoint}`)
    },
    async upload(p: string, bytes: Uint8Array, mode: UploadMode): Promise<DropboxFileMetadata> {
      ops.push(`upload ${mode.tag} ${p}`)
      const got = files.get(p)
      if (mode.tag === 'add' ? got !== undefined : got?.rev !== mode.rev) throw conflict()
      revs += 1
      files.set(p, { bytes, rev: `r${revs}` })
      return { rev: `r${revs}`, size: bytes.length, serverModified: '' } as DropboxFileMetadata
    },
    async remove(p: string) {
      ops.push(`remove ${p}`)
      files.delete(p)
    },
    download: () => Promise.reject(new Error('使わない')),
    createFolder: () => Promise.reject(new Error('使わない')),
    accessToken: async () => 'token',
  }
  return { client, files, ops }
}

const ROOT = '/akira/Documents/esl-writing'
const DIR = `${ROOT}/backups`
let tmp: string

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'esl-backup-'))
})
after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('backupsToDelete', () => {
  it('このアプリの名前の形のものだけを、新しい順に keep 個残して消す', () => {
    const names = ['esl-writing-2026-11-01.db', 'esl-writing-2026-11-03.db', 'memo.txt']
    names.push('esl-writing-2026-11-02.db')
    assert.deepEqual(backupsToDelete(names, 2), ['esl-writing-2026-11-01.db'])
    assert.deepEqual(backupsToDelete(names, 5), [])
  })
})

describe('バックアップ', () => {
  it('DB を 1 ファイルにして日付の名前で上げ、同じ日はもう一度上書きする。開ける SQLite になっている', async () => {
    const db = openDatabase(':memory:')
    createParagraphStore(db).createParagraph('2026-11-11', 'Pets', '# Pets\n')
    const dropbox = fakeDropbox()
    const options = {
      db,
      client: dropbox.client,
      root: ROOT,
      tempFile: path.join(tmp, 'a.db'),
      today: () => '2026-11-11',
    }
    const uploaded = await backupNow(options)
    assert.equal(uploaded, `${DIR}/${backupFileName('2026-11-11')}`)
    await backupNow(options)
    assert.deepEqual(
      dropbox.ops.filter((op) => op.startsWith('upload')),
      [`upload add ${uploaded}`, `upload add ${uploaded}`, `upload update ${uploaded}`],
    )
    // 上げた中身を開くと、同じデータが入っている
    const restored = path.join(tmp, 'restored.db')
    await writeFile(restored, dropbox.files.get(uploaded)?.bytes ?? new Uint8Array())
    const copy = new DatabaseSync(restored)
    assert.deepEqual(
      copy
        .prepare('SELECT id FROM paragraphs')
        .all()
        .map((r) => r['id']),
      ['2026-11-11-pets'],
    )
    copy.close()
  })

  it('古いバックアップは新しい 30 個を残して消す', async () => {
    const old = Array.from(
      { length: 30 },
      (_, i) => `${DIR}/esl-writing-2026-10-${String(i + 1).padStart(2, '0')}.db`,
    )
    const dropbox = fakeDropbox(old)
    const db = openDatabase(':memory:')
    await backupNow({
      db,
      client: dropbox.client,
      root: ROOT,
      tempFile: path.join(tmp, 'b.db'),
      today: () => '2026-11-11',
    })
    assert.deepEqual(
      dropbox.ops.filter((op) => op.startsWith('remove')),
      [`remove ${DIR}/esl-writing-2026-10-01.db`],
    )
  })

  it('backupIfChanged は前のバックアップから変わっていなければ上げない。失敗しても投げない', async () => {
    const db = openDatabase(':memory:')
    let tick = 0
    const now = () => new Date(Date.UTC(2026, 10, 11, 0, 0, tick++)).toISOString()
    const store = createParagraphStore(db, { now })
    const id = store.createParagraph('2026-11-11', 'Pets', '# Pets\n')
    const dropbox = fakeDropbox()
    const options = {
      db,
      client: dropbox.client,
      root: ROOT,
      tempFile: path.join(tmp, 'c.db'),
      today: () => '2026-11-11',
    }
    assert.equal(await backupIfChanged(options), true)
    assert.equal(await backupIfChanged(options), false)
    store.saveStage(id, 'draft', 'I like pets.', null)
    assert.equal(await backupIfChanged(options), true)
    store.saveStage(id, 'draft', 'I like cats.', '1')
    const broken = {
      ...options,
      client: { ...dropbox.client, upload: () => Promise.reject(new Error('x')) },
    }
    assert.equal(await backupIfChanged(broken), false)
  })
})
