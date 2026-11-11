import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * ローカルの SQLite（`node:sqlite`）を開き、表を用意する（`docs/plans/archive/sqlite-storage.md`）。
 *
 * - ファイルは既定で `data/esl-writing.db`（`ESL_DB_PATH`）。**Dropbox のフォルダには置かない**（同期中に書くと壊れることがある）
 * - WAL モード。サーバ 1 つから使う前提（自分専用・ローカル）
 * - 表の形は `SCHEMA_VERSION` で持ち、上げるときは `migrate()` に足す
 */

export const SCHEMA_VERSION = 2

const SCHEMA_V1 = `
CREATE TABLE paragraphs (
  id TEXT PRIMARY KEY,
  created_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE stages (
  paragraph_id TEXT NOT NULL REFERENCES paragraphs(id),
  stage TEXT NOT NULL,
  text TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (paragraph_id, stage)
);
CREATE TABLE feedbacks (
  paragraph_id TEXT PRIMARY KEY REFERENCES paragraphs(id),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ai_results (
  paragraph_id TEXT NOT NULL REFERENCES paragraphs(id),
  kind TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (paragraph_id, kind)
);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** 版 2（2026-11-11）: AI案への質問と答え（`docs/plans/ai-followup-questions.md`）。 */
const SCHEMA_V2 = `
CREATE TABLE ai_questions (
  paragraph_id TEXT NOT NULL REFERENCES paragraphs(id),
  kind TEXT NOT NULL,
  seq INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (paragraph_id, kind, seq)
);
`

/** `BEGIN IMMEDIATE` 〜 `COMMIT`。投げたら `ROLLBACK`。 */
export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = run()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function readMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return typeof row?.['value'] === 'string' ? row['value'] : null
}

export function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

function migrate(db: DatabaseSync): void {
  const hasMeta =
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get() !==
    undefined
  const version = hasMeta ? Number(readMeta(db, 'schema_version') ?? 0) : 0
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `DB の版（${version}）がこのアプリ（${SCHEMA_VERSION}）より新しいので開けません`,
    )
  }
  if (version === SCHEMA_VERSION) return
  transaction(db, () => {
    if (version < 1) db.exec(SCHEMA_V1)
    if (version < 2) db.exec(SCHEMA_V2)
    writeMeta(db, 'schema_version', String(SCHEMA_VERSION))
  })
}

/** 開いて表を用意する。`:memory:` も渡せる（テスト）。親のフォルダが無ければ作る。 */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}
