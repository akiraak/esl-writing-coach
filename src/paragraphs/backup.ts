import { readFile, rm } from 'node:fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { type DropboxClient, isConflictError, isNotFoundError } from '../dropbox/client.js'
import { describeError, log } from '../log.js'
import { readMeta, writeMeta } from './database.js'

/**
 * DB を Dropbox にバックアップする（`docs/plans/archive/sqlite-storage.md` の Phase 4）。**同期ではなくバックアップだけ**。
 *
 * - `VACUUM INTO` で DB を 1 ファイルにして、`<保存先>/backups/esl-writing-YYYY-MM-DD.db` に上げる（1 日 1 ファイル。同じ日は上書き）
 * - サーバは起動時と 1 時間ごとに、**前のバックアップから DB が変わっていれば**上げる
 * - 新しい `KEEP_BACKUPS` 個を残して、古いものは消す（Dropbox の削除済みファイルからは戻せる）
 * - 戻すとき: サーバを止め、上げたファイルを `data/esl-writing.db` に置き換える（`-wal`・`-shm` は消す）
 */

export const BACKUP_DIR = 'backups'
export const KEEP_BACKUPS = 30
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000

const BACKUP_NAME = /^esl-writing-\d{4}-\d{2}-\d{2}\.db$/

export function backupFileName(date: string): string {
  return `esl-writing-${date}.db`
}

/** 消すバックアップの名前（このアプリの名前の形のものだけ。新しい `keep` 個を残す）。 */
export function backupsToDelete(names: readonly string[], keep = KEEP_BACKUPS): string[] {
  return names
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
    .reverse()
    .slice(keep)
}

/** DB の中身が最後に変わった時刻（ISO8601）。空なら空文字。 */
export function dataStamp(db: DatabaseSync): string {
  const row = db
    .prepare(`
      SELECT max(t) AS t FROM (
        SELECT max(updated_at) AS t FROM stages
        UNION ALL SELECT max(updated_at) FROM feedbacks
        UNION ALL SELECT max(created_at) FROM ai_results
        UNION ALL SELECT max(created_at) FROM ai_questions
        UNION ALL SELECT max(coalesce(deleted_at, created_at)) FROM paragraphs
      )
    `)
    .get()
  return typeof row?.['t'] === 'string' ? row['t'] : ''
}

export interface BackupOptions {
  db: DatabaseSync
  client: DropboxClient
  /** Dropbox の保存先（`/akira/Documents/esl-writing`）。 */
  root: string
  /** `VACUUM INTO` の書き出し先（一時ファイル。終わったら消す）。 */
  tempFile: string
  /** `YYYY-MM-DD`（ファイル名に使う日付）。 */
  today: () => string
}

interface ListFolderResult {
  entries: { '.tag': string; name?: string }[]
  cursor: string
  has_more: boolean
}

/** 同じ名前があれば、その rev で上書きする（バックアップのファイルは自分しか書かない）。 */
async function put(client: DropboxClient, path: string, bytes: Uint8Array): Promise<void> {
  try {
    await client.upload(path, bytes, { tag: 'add' })
  } catch (error) {
    if (!isConflictError(error)) throw error
    const meta = await client.rpc<{ rev?: string }>('/2/files/get_metadata', { path })
    if (meta.rev === undefined) throw error
    await client.upload(path, bytes, { tag: 'update', rev: meta.rev })
  }
}

async function prune(client: DropboxClient, dir: string): Promise<string[]> {
  const names: string[] = []
  let result = await client.rpc<ListFolderResult>('/2/files/list_folder', { path: dir })
  names.push(...result.entries.flatMap((e) => (e['.tag'] === 'file' && e.name ? [e.name] : [])))
  // 件数が少なくても has_more が付くことがある。必ず最後まで辿る
  while (result.has_more) {
    result = await client.rpc<ListFolderResult>('/2/files/list_folder/continue', {
      cursor: result.cursor,
    })
    names.push(...result.entries.flatMap((e) => (e['.tag'] === 'file' && e.name ? [e.name] : [])))
  }
  const targets = backupsToDelete(names)
  for (const name of targets) {
    try {
      await client.remove(`${dir}/${name}`)
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  }
  return targets
}

/** 今すぐバックアップする。上げたパスを返す。 */
export async function backupNow(options: BackupOptions): Promise<string> {
  const { db, client, tempFile } = options
  const stamp = dataStamp(db)
  await rm(tempFile, { force: true })
  let bytes: Buffer
  try {
    db.exec(`VACUUM INTO '${tempFile.replaceAll("'", "''")}'`)
    bytes = await readFile(tempFile)
  } finally {
    await rm(tempFile, { force: true })
  }
  const dir = `${options.root}/${BACKUP_DIR}`
  const path = `${dir}/${backupFileName(options.today())}`
  await put(client, path, bytes)
  writeMeta(db, 'last_backup_stamp', stamp)
  writeMeta(db, 'last_backup_at', new Date().toISOString())
  const removed = await prune(client, dir)
  log.info(
    `バックアップ: ${path}（${bytes.length} バイト）${removed.length > 0 ? `・古いもの ${removed.length} 個を消しました` : ''}`,
  )
  return path
}

/** 前のバックアップから DB が変わっていればバックアップする。失敗しても投げない（warn）。 */
export async function backupIfChanged(options: BackupOptions): Promise<boolean> {
  try {
    if (dataStamp(options.db) === (readMeta(options.db, 'last_backup_stamp') ?? '')) return false
    await backupNow(options)
    return true
  } catch (error) {
    log.warn(`バックアップできません: ${describeError(error)}`)
    return false
  }
}

/** 起動時と `intervalMs` ごとに `backupIfChanged`。止めるときは戻り値を呼ぶ。 */
export function startBackups(options: BackupOptions, intervalMs = BACKUP_INTERVAL_MS): () => void {
  let running = false
  const tick = () => {
    if (running) return
    running = true
    void backupIfChanged(options).finally(() => {
      running = false
    })
  }
  const first = setTimeout(tick, 0)
  const timer = setInterval(tick, intervalMs)
  first.unref()
  timer.unref()
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
