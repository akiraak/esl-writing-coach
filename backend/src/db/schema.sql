CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',          -- 文章生成のルール
  draft TEXT NOT NULL DEFAULT '',          -- ユーザーの英作文（日本語混在可）
  corrected TEXT NOT NULL DEFAULT '',      -- AI の添削済み英文（最新のみ）
  advice TEXT NOT NULL DEFAULT '',         -- AI からのアドバイス（最新のみ）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  corrected_at TEXT                        -- 最後に添削した日時
);
