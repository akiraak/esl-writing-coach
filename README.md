# esl-writing-coach

英語学習（ESL）のための英作文コーチ Web アプリ。記事を書くと自動保存のタイミングで Claude が添削・アドバイスを返す。自分専用のローカルツール（認証なし）。

## セットアップ

```bash
cd backend
npm install
cp .env.example .env
# .env に ANTHROPIC_API_KEY を設定する（添削に必須）
```

## 起動

```bash
./run-server.sh        # 通常起動（ポート使用中のプロセスを停止してから起動）
./run-server.sh dev    # 開発（tsx watch）
```

または `cd backend` して `npm start` / `npm run dev` でも起動できる。

`http://localhost:3013` で開く（ポートは `.env` の `PORT` で変更可）。

## 画面

- **記事一覧** (`/`): 記事の一覧・新規作成・削除
- **記事の作成・編集** (`/article.html?id=N`): 4 欄エディタ
  - 文章生成のルール / ユーザーの英作文（日本語混在可）は入力欄。入力停止から 2 秒で自動保存され、内容が変わっていれば添削が走る
  - AI の添削済み英文 / AI からのアドバイスは出力欄（最新の添削結果のみ保持）

## API

- `GET/POST /api/articles` — 一覧 / 新規作成
- `GET/PUT/DELETE /api/articles/:id` — 取得 / 保存 / 削除
- `POST /api/articles/:id/correct` — 保存済みの rules + draft で添削を実行

## 開発管理画面 (vibeboard)

`./run-vibeboard.sh` で起動し `http://localhost:3012` で開く。詳細は `CLAUDE.md` を参照。
