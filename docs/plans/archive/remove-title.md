# タイトル廃止 実装プラン

## 目的・背景

記事のタイトルは不要（TODO「タイトルは必要ない」）。入力欄・一覧表示・API・DB からタイトルを取り除き、一覧では代わりに本文（draft）の冒頭を表示する。

## 対応方針

- **DB**: `articles.title` カラムを廃止。`schema.sql` から削除し、既存 DB 向けに起動時マイグレーション（カラムが存在すれば `ALTER TABLE ... DROP COLUMN`。SQLite 3.35+ / better-sqlite3 同梱版で対応済み）
- **API**: `PUT /api/articles/:id` から `title` を除去。一覧 (`GET /api/articles`) は `title` の代わりに `excerpt`（draft の冒頭 100 文字）を返す
- **フロント**:
  - 編集画面: ヘッダーのタイトル入力欄を削除（戻るリンク + ステータス表示のみに）
  - 一覧画面: 行の表示を「draft の冒頭（空なら "(本文なし)"）+ 更新日時」に変更。削除確認ダイアログもタイトル非依存の文言にする

## 影響範囲

- `backend/src/db/schema.sql` / `db/index.ts`（マイグレーション追加） / `db/repo.ts`
- `backend/src/routes/articles.ts`
- `backend/public/article.html` / `js/article.js` / `index.html`(変更なし) / `js/index.js`
- `README.md`（画面説明にタイトルへの言及があれば修正）

## テスト方針

- `npm run typecheck`
- 既存 DB（title カラムあり）でサーバーを起動し、マイグレーションでカラムが消えること
- curl で一覧（excerpt が返る）・保存（title なし）・添削フローが動くこと
- ブラウザで一覧・編集画面の表示を確認
