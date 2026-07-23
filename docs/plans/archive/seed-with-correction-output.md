# シード記事に添削済み英文とアドバイスも入れる

## 目的・背景

- 現状のシード記事（ESL 課題 1: 自己紹介）は rules / draft のみで、添削済み英文とアドバイスの欄は空
- 初めて開いたユーザーが「添削されるとどうなるか」を最初から見られるよう、出力 2 欄も事前に埋めておく

## 対応方針

- `seed.ts` に `SEED_CORRECTED` / `SEED_ADVICE` 定数を追加し、`seedDefaultArticle()` の INSERT で corrected / advice / corrected_at も入れる
- シード時に LLM は呼ばない（従来どおり）。定数の中身は、実際の添削 API（`correctDraft`）に SEED_RULES / SEED_DRAFT を一度通した本物の出力を焼き込む
  - 本物の出力なので、アプリの実際の添削品質・アドバイスの体裁（日本語の箇条書き・Markdown）と一致する
- `corrected_at` はシード時の現在時刻を入れる

## 影響範囲

- `backend/src/db/seed.ts` のみ（スキーマ・repo・フロントは変更なし）
- 実 DB は現行シード記事（未編集なら）を削除して `seeded_at` をリセットし、新内容で入れ直す

## テスト方針

- `npm run typecheck`
- 実 DB で再シードし、API で corrected / advice / corrected_at が入っていること
- ヘッドレス Chromium で編集画面の出力 2 欄（Markdown レンダリング）を確認
