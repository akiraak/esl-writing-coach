# webアプリの作成 実装プラン

## 目的・背景

英作文コーチ Web アプリの初期実装。ユーザーが英文記事を書き、自動保存のタイミングで Claude が添削・アドバイスを返す、自分専用のローカルツールを作る（詳細仕様は `CLAUDE.md` 参照）。

- 画面は「記事一覧」「記事の作成・編集」の 2 つ
- 記事は 4 欄: 文章生成のルール（入力）/ ユーザーの英作文（入力）/ AI の添削済み英文（出力）/ AI からのアドバイス（出力）
- 添削結果は最新のみ保持（履歴なし）
- 認証なし・マルチユーザーなし

## 対応方針

ai-secretary と同様の構成に合わせる。

- **バックエンド**: TypeScript + Node.js (>=22) + Express。ESM、`tsx` で実行（`dev` は `tsx watch`）。ビルドは `tsc`
- **フロントエンド**: 素の HTML + JS（ビルドなし）。`public/` を Express が静的配信
- **DB**: SQLite（`better-sqlite3`）。DB ファイルは `backend/data/esl-writing-coach.db`（.gitignore 対象）
- **LLM**: `@anthropic-ai/sdk`。API キーは `.env`（`ANTHROPIC_API_KEY`）で管理し `.env.example` を用意
- **ポート**: 3010/3011 は他プロジェクト、3012 は vibeboard が使用中のため、アプリは **3013** を使う（env `PORT` で変更可）

### ディレクトリ構成（予定）

```
backend/
  package.json / tsconfig.json / .env.example
  data/                  # SQLite ファイル（gitignore）
  public/                # 静的フロント
    index.html           # 記事一覧
    article.html         # 記事の作成・編集
    js/ css/
  src/
    index.ts             # エントリ（Express 起動）
    config.ts            # env 読み込み
    db/                  # スキーマ初期化・クエリ
    routes/              # API ルート
    llm/                 # Claude 呼び出し（添削プロンプト）
```

### DB スキーマ（1 テーブル）

```sql
CREATE TABLE articles (
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
```

### API（JSON）

- `GET    /api/articles` — 一覧（id, title, updated_at など）
- `POST   /api/articles` — 新規作成（空記事を作って id を返す）
- `GET    /api/articles/:id` — 1 件取得
- `PUT    /api/articles/:id` — title / rules / draft を保存（自動保存の受け口）
- `DELETE /api/articles/:id` — 削除
- `POST   /api/articles/:id/correct` — 保存済みの rules + draft で添削を実行し、corrected / advice を上書きして返す

保存と添削を分離する（保存は即時・軽量、添削は Claude 呼び出しで数秒かかるため）。フロントは自動保存の成功後に添削 API を呼ぶ。

### フロントの挙動

- **記事一覧** (`index.html`): 一覧表示（タイトル・更新日時）、新規作成ボタン、行クリックで編集画面へ、削除
- **編集画面** (`article.html?id=N`): タイトル + 4 欄。rules / draft は編集可、corrected / advice は読み取り専用表示
  - **自動保存**: 入力停止から一定時間（2 秒程度）のデバウンスで `PUT` 保存 → 成功したら `POST /correct` を実行
  - draft が前回添削時から変わっていなければ添削はスキップ（無駄な API 呼び出し防止）
  - 添削中はインジケータ表示。多重実行は抑止（実行中に再度発火したら最新の内容で 1 回だけ再実行）

### 添削プロンプト方針

system 相当で「ESL 学習者の英作文コーチ」であること、rules を制約として渡すことを指示。ユーザー本文（日本語混在可）を渡し、以下の 2 パートを構造化して返させる（tool use もしくは明確な区切りで分離）:

1. 添削済み英文（日本語部分は英訳して組み込む）
2. アドバイス（文法・語彙・自然さの解説。日本語で出力）

モデルは config で切り替え可能にする。

### スコープ外（今回はやらない）

- OCR によるルール画像取り込み（将来タスクとして TODO に残す）
- 添削履歴の保持
- 認証・公開デプロイ

## 影響範囲

- 新規: `backend/` 一式
- 変更: `.gitignore`（`backend/data/`・`.env` 追加）、`README.md`（起動手順）、`TODO.md` / `DONE.md`

## テスト方針

- `npm run typecheck` が通ること
- curl で API の CRUD + 添削を一通り確認（添削は実 API キーで 1 回実行して corrected / advice が保存されることを確認）
- ブラウザで 2 画面を手動確認: 新規作成 → 入力 → 自動保存 → 添削結果表示 → 一覧に戻って再編集、削除

## Phase / Step

- **Phase 1: バックエンド土台** — `backend/` 雛形（package.json, tsconfig, .env.example）、Express 起動、静的配信、DB 初期化
- **Phase 2: 記事 CRUD API** — articles テーブルと `GET/POST/PUT/DELETE /api/articles` 実装、curl で確認
- **Phase 3: フロント 2 画面** — 記事一覧・編集画面（4 欄 + 自動保存）。この時点では添削なしで保存まで動く状態
- **Phase 4: 添削（Claude 連携）** — `llm/` 実装、`POST /correct`、フロントから自動保存後に添削実行・結果表示
- **Phase 5: 仕上げ** — 変更スキップ・多重実行抑止などの挙動調整、README 起動手順、.gitignore 整理、手動テスト一巡
