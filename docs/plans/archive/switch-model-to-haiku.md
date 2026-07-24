# 添削モデルを Haiku（claude-haiku-4-5）へ変更

## 目的・背景

添削の LLM を claude-sonnet-5 から claude-haiku-4-5 へ変更する（コスト削減）。

## 対応方針

1. `backend/.env`・`backend/.env.example`・`config.ts` のデフォルトの `LLM_MODEL` を `claude-haiku-4-5` に変更
2. `correct.ts` の `thinking: { type: 'adaptive' }` を修正
   - adaptive thinking は Claude 4.6 以降専用で、Haiku 4.5 に送ると 400 エラー
   - モデル名に `haiku` を含む場合は thinking を送らない（Sonnet/Opus 系に戻したときは adaptive のまま）
   - `output_config` の json_schema 構造化出力は Haiku 4.5 対応なので不変

## 影響範囲

- `backend/.env` / `backend/.env.example` / `backend/src/config.ts`（モデル ID）
- `backend/src/llm/correct.ts`（thinking の条件分岐）
- フロントエンドは不変

## テスト方針

- typecheck
- 実 API での添削 1 回（テスト記事作成 → 添削が 400 にならず Markdown 形式の advice が返ることを確認 → 削除）
