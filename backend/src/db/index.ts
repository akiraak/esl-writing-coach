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

  // 旧スキーマの articles には user_id が無く、schema.sql のインデックス作成が
  // 失敗するため、スキーマ適用より先にマイグレーションを走らせる
  migrate(conn);
  conn.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  db = conn;
  return db;
}

/** 既存 DB への追いつきマイグレーション（何度呼んでも安全）。 */
function migrate(conn: Database.Database): void {
  const columns = conn.prepare('PRAGMA table_info(articles)').all() as { name: string }[];
  if (columns.length === 0) return; // 新規 DB: schema.sql がテーブルを作る

  // タイトル廃止: 旧スキーマの title カラムを削除
  if (columns.some((c) => c.name === 'title')) {
    conn.exec('ALTER TABLE articles DROP COLUMN title');
  }

  // マルチユーザー化: user_id カラムが無ければテーブルを作り直して追加し、
  // 既存記事は OWNER_EMAIL（無ければ DEV_USER_EMAIL）のユーザーへ割り当てる
  if (!columns.some((c) => c.name === 'user_id')) {
    conn.transaction(() => {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        )
      `);

      const { n } = conn.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number };
      let ownerId: number | null = null;
      if (n > 0) {
        const email =
          config.ownerEmail ?? (config.auth.mode === 'dev' ? config.auth.devUserEmail : undefined);
        if (!email) {
          throw new Error(
            '既存記事の割り当て先が不明です。OWNER_EMAIL を設定して一度起動してください',
          );
        }
        conn
          .prepare('INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
          .run(email, new Date().toISOString());
        const owner = conn.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
          id: number;
        };
        ownerId = owner.id;
      }

      // SQLite は NOT NULL + REFERENCES 付きカラムの ALTER ADD ができないため作り直す
      conn.exec(`
        CREATE TABLE articles_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          rules TEXT NOT NULL DEFAULT '',
          draft TEXT NOT NULL DEFAULT '',
          corrected TEXT NOT NULL DEFAULT '',
          advice TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          corrected_at TEXT
        )
      `);
      conn
        .prepare(
          `INSERT INTO articles_new (id, user_id, rules, draft, corrected, advice, created_at, updated_at, corrected_at)
           SELECT id, ?, rules, draft, corrected, advice, created_at, updated_at, corrected_at FROM articles`,
        )
        .run(ownerId);
      conn.exec('DROP TABLE articles');
      conn.exec('ALTER TABLE articles_new RENAME TO articles');
    })();
  }

  // サンプル記事シード対応: users に seeded_at カラムが無ければ追加
  // （既存ユーザーは NULL のままになり、次回アクセス時に 1 回だけシードされる）
  const userColumns = conn.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (userColumns.length > 0 && !userColumns.some((c) => c.name === 'seeded_at')) {
    conn.exec('ALTER TABLE users ADD COLUMN seeded_at TEXT');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
