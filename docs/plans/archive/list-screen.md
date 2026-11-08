# 一覧画面

## 目的・背景

一覧画面を仕上げる。いまは id・進み具合・更新日だけを出している。
パラグラフのカードにテーマを出し、新規作成と削除をできるようにする（`CLAUDE.md` の「画面構成」、モックは `docs/plans/archive/design-examples/decided.html`）。

## 対応方針

### Phase 1: 一覧の API にテーマを足す（サーバ）

- `GET /api/paragraphs` の各項目に `theme`（`assignment.md` の `# ` 行。無い・読めなければ空文字）を足す。型は `ParagraphListItem = ParagraphSummary & { theme }`（`src/shared/types.ts`）
- テーマはサーバで各 `assignment.md` を読んで `parseAssignment()` で取る（`src/paragraphs/themes.ts`）
  - **id + rev で覚えておき**、一覧の `rev` が変わっていなければ読み直さない（一覧を開くたびに全件ダウンロードしないため）
  - 同時に読むのは 6 件まで
  - 1 件読めなくても一覧全体は失敗させない（その件のテーマは空。warn をログに出す）
- ブラウザから 1 件ずつ読む案は、件数分のリクエストが画面から飛ぶのと、キャッシュをサーバに置けないので採らない

### Phase 2: 一覧の画面（ブラウザ）

- カード: テーマ（空なら id を薄く）・4 段階の進み具合・更新日・「削除」
  - カード全体をリンクにする（タイトルの `<a>` を CSS でカード全体に広げる。削除ボタンはその上に出す。`<a>` の中にボタンを入れない）
- 新規作成: 見出しの右の「＋ 新規作成」と、末尾の破線のカード「＋ 新しいパラグラフ」。押すと `<dialog>` でテーマを聞く
  - テーマは空でもよい（後で課題の画面で入れられる。フォルダ名は `paragraph` になる）
  - 作ったら課題の画面（`#/p/<id>/assignment`）を開く。失敗したらダイアログの中に出す
- 削除: `confirm()` でテーマを見せて確かめる（Dropbox の削除済みファイルから戻せることも書く）。消したらカードを取り除く。失敗したら知らせる
- 0 件のときは「まだパラグラフはありません」と破線のカード

## 影響範囲

- `src/shared/types.ts`・`src/paragraphs/themes.ts`（新規）・`src/server/api.ts`・`src/server/server.ts`
- `src/browser/api.ts`・`src/browser/views/list.ts`・`web/style.css`
- `CLAUDE.md`（API の説明にテーマを足す）

## テスト方針

- `test/themes.test.ts`: rev が同じなら読み直さない・変われば読み直す・`assignment.md` が無い／0 バイトなら読まない・読めない件は空・同時に読む数の上限
- `test/server.test.ts`: `GET /api/paragraphs` に `theme` が入る
- 画面は `./run-server.sh` で起動して、ブラウザで新規作成 → 課題の画面、削除を確かめる（実 Dropbox を使うので、削除は自分で作った試し用のものだけ）
