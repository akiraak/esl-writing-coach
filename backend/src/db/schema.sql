CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,              -- Cloudflare Access が検証したメールアドレス
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rules TEXT NOT NULL DEFAULT '',          -- 文章生成のルール
  draft TEXT NOT NULL DEFAULT '',          -- ユーザーの英作文（日本語混在可）
  corrected TEXT NOT NULL DEFAULT '',      -- AI の添削済み英文（最新のみ）
  advice TEXT NOT NULL DEFAULT '',         -- AI からのアドバイス（最新のみ）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  corrected_at TEXT                        -- 最後に添削した日時
);

CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
