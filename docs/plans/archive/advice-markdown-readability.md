# AI アドバイスの Markdown 整形強化（読みやすさ改善）

## 目的・背景

AI アドバイスの表示が読みづらい。調査の結果、フロントの Markdown 描画（marked + DOMPurify + `.output` CSS）は正常に動いているが、**AI の出力自体がほぼ Markdown を使っていない**ことが原因と判明した。

- DB 内の添削済み 4 記事のアドバイスを確認したところ、箇条書きはすべて日本語の「・」で、Markdown のリスト記法（`- `）・見出しはゼロ、太字 `**` は 1 件のみ
- 「・」は Markdown ではただの段落として描画されるため、インデントなしのベタっとした段落の羅列になり、項目の切れ目・要点が視覚的に掴みにくい
- 原因はプロンプト: `backend/src/llm/correct.ts` の SYSTEM_PROMPT が「Format as concise bullet points」とだけ指示しており、Markdown で書けとは言っていない

## 対応方針

### Step 1: プロンプトで advice の Markdown フォーマットを明示する

`correct.ts` の SYSTEM_PROMPT に advice の出力形式を具体的に指定する:

- Markdown で書く（`- ` の箇条書き。「・」は使わない）
- 各項目の冒頭に観点を `**太字**` のラベルで付ける（例: `**文法**`、`**語彙**`、`**自然さ**`）
- before/after は引用符付きで `"..." → "..."` の形で示す
- 見出しは使わない（欄が狭いので箇条書きのみで十分）

### Step 2: CSS の微調整

長文の箇条書き項目が続くため、トップレベルのリスト項目間の余白を広げて項目の切れ目を見やすくする（`.output li` の margin 調整）。

### Step 3: 実機確認

1. 開発サーバー + 実 API で 1 回添削を実行し、advice が Markdown で返ることを確認
2. ヘッドレス Chromium でスクリーンショットを撮り、リスト・太字が効いた表示になっていることを目視確認
3. `npm run typecheck` 相当のチェック

## 影響範囲

- `backend/src/llm/correct.ts`（プロンプトのみ。スキーマ・API 呼び出しは不変）
- `backend/public/css/style.css`（`.output` のリスト余白）
- 既存記事の保存済みアドバイスは旧形式のまま（再添削すれば新形式になる）。表示が壊れるわけではないので移行はしない

## テスト方針

- typecheck
- 実 API での添削 1 回（テスト記事を作成 → 添削 → 検証後に削除）
- ヘッドレス Chromium で添削結果のスクリーンショットを目視確認
