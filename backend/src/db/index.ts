import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db: Database.Database | null = null;

/** SQLite 接続を返す（初回はファイル作成 + スキーマ適用）。プロセス内でシングルトン。 */
export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.db.path), { recursive: true });
  const conn = new Database(config.db.path);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');

  conn.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(conn);
  db = conn;
  return db;
}

/** 既存 DB への追いつきマイグレーション（何度呼んでも安全）。 */
function migrate(conn: Database.Database): void {
  // タイトル廃止: 旧スキーマの title カラムを削除
  const columns = conn.prepare('PRAGMA table_info(articles)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'title')) {
    conn.exec('ALTER TABLE articles DROP COLUMN title');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
