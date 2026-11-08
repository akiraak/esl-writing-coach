# Dropbox への接続と読み書き

## 目的・背景

MVP の最初の実装タスク。パラグラフのデータは Dropbox 上のファイルとして持つ（`CLAUDE.md` の「データ保存」）。
画面（一覧・編集）や API を作る前に、その下で使う**保存層**（Dropbox クライアントとパラグラフの読み書き）を作り、
本物の Dropbox で読み書きできることを確かめる。

リポジトリにはまだコードが無い（2026-11-07 に全削除）ので、TypeScript の土台もここで作る。

## 対応方針

daily-note（`/home/ubuntu/daily-note`）の実装を移植し、このアプリに要らない部分を落とす。

### Phase 1: プロジェクトの土台

- `package.json`（Node 22・ESM）、`tsconfig.json`（daily-note と同じ strict 設定）、`tsconfig.test.json`、`biome.json`、`.gitignore`、`.env.example`
- npm scripts: `build` / `typecheck` / `test`（`node --test`）/ `lint` / `dropbox:check` / `dropbox:smoke`
- esbuild とブラウザ向けの設定は画面を作るタスクで足す（いまは入れない）
- `.env` は daily-note の `.env` から `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN` だけを写し、
  `DROPBOX_ROOT=/akira/Documents/esl-writing` を足す（Dropbox アプリは daily-note と共用。2026-11-08 決定）。値は表示しない・コミットしない

### Phase 2: Dropbox クライアントの移植

- `src/log.ts`: 秘密（トークン）を伏せるログ。daily-note のまま
- `src/config.ts`: `PORT`（既定 3016。project-manager の `projects.yaml` に合わせる）と Dropbox の設定だけ。
  Cloudflare Access・綴りの確認・AI の設定は持たない（ローカル専用・認証なし）
- `src/dropbox/client.ts`: daily-note のまま移す（トークンの自動更新、401 で 1 回だけ取り直す、`add` / `update` のみで `overwrite` は無い）。
  `move` はこのアプリでは使わないので落とし、フォルダの作成（`create_folder_v2`）と、`rev` を付けない削除（フォルダ用）を足す
- リフレッシュトークンを取り直すスクリプト（daily-note の `dropbox-auth`）は移さない。トークンは daily-note と共用なので、取り直すときは daily-note 側で行う

### Phase 3: パラグラフの保存層

`src/paragraphs/` に置く。ネットワークを触らない部分は純関数にしてテストする。

- `text.ts`: バイト列 ⇔ 文字列（daily-note の `notes/text.ts` を移す）。改行コード・BOM・末尾の改行を読み込み時に控え、保存時に戻す
  （`outline.txt` は daily-note のマップでも開くので、他で保存された形式を崩さない）
- `naming.ts`: フォルダ名（パラグラフの id）
  - 作成日 + テーマから作る（例: `2026-11-08-should-students-wear-school-uniforms`）。英数字以外は `-`、40 文字までを単語の切れ目で切る。英字が無ければ `paragraph`
  - 同名があれば `-2`, `-3` … を付ける
  - API から来た id は `YYYY-MM-DD-[a-z0-9-]+` だけを受け付ける（パスに `..` や `/` を入れさせない）
  - テーマを後で変えてもフォルダ名は変えない（id として使うだけ。テーマの正は `assignment.md`）
- `store.ts`: パラグラフの読み書き
  - `listParagraphs()`: `paragraphs/` を `list_folder`（`recursive: true`）で取り、**`has_more` が無くなるまで `list_folder/continue` で辿る**。
    パラグラフごとに、どの段階のファイルがあるか（サイズ・更新時刻）と更新日（ファイルの最新の `server_modified`。ファイルが無ければフォルダ名の日付）を返す。
    フォルダがまだ無ければ空の一覧
  - `readStage(id, stage)`: 段階のファイルを取る → 文字列・`rev`・書式。ファイルが無ければ空文字・`rev` なし
  - `saveStage(id, stage, text, base)`: `rev` があれば `update`、無ければ `add`。
    **`rev` が合わない（他で更新された）・既にある、は上書きせず `StageConflictError`** を投げる
  - `createParagraph(date, theme)`: `create_folder_v2` でフォルダだけを作る（`autorename` はしない。同名なら次の番号）
  - `deleteParagraph(id)`: `delete_v2` でフォルダごと消す（Dropbox の削除済みファイルから戻せる）
- **一覧の進み具合の判定**（デザイン決定のときの宿題）: 新規作成ではフォルダだけを作り、空のファイルは作らない。
  段階のファイルが「無い・0 バイト」なら未着手、それ以外は着手済みとする

### Phase 4: 本物の Dropbox で確かめる

- `npm run dropbox:check`（読むだけ）: 保存先フォルダの有無と、パラグラフの件数を出す。中身は読まない
- `npm run dropbox:smoke`（書く）: 保存先の中の作業用フォルダ `/akira/Documents/esl-writing/.smoke-test/` で
  作成 → 読み込み → `update` で保存 → 古い `rev` で保存して競合になること → 削除、を通し、最後に作業用フォルダを消す。
  `paragraphs/` には触れない

## 結果（2026-11-08）

- 4 Phase とも完了。`npm test` 73 件・`npm run lint`・`npm run typecheck` が通る
- `npm run dropbox:check`: トークンの更新と `paragraphs/` の一覧ができた（0 件）
- `npm run dropbox:smoke`: 作成 → 一覧 → 空の読み込み → add → 読み戻し → update → 古い rev で競合（上書きされない）→ 着手済みの反映 → 削除、が本物の Dropbox で通った。
  作業用フォルダは消えた。保存先の `/akira/Documents/esl-writing/` はこのとき作られ、空のまま残っている
- `create_folder_v2` は親フォルダ（`paragraphs/`）も作る（smoke で確認）
- lint の指摘で、文字列の最大値を `Math.max` にする提案（Biome の `useMathMinMax`）は文字列では誤りなので採らず、並べ替えで書いた

## 影響範囲

- 新規: `package.json`・設定ファイル類、`src/`、`test/`、`.env`（git 管理外）
- Dropbox: `/akira/Documents/esl-writing/.smoke-test/` を一時的に作って消す（`dropbox:smoke` を流したとき）
- `CLAUDE.md` に開発コマンドと保存層の要点を追記

## テスト方針

- `node --test` で、偽の `fetch` を差し込んでクライアントを確かめる（トークンの更新・401 の再送・競合の判定・`Dropbox-API-Arg` の逃がし）。daily-note のテストを移す
- 偽の Dropbox クライアントを差し込んで保存層を確かめる（`has_more` を辿りきる・進み具合・競合・id の検査・フォルダ名の重複）
- `text.ts`・`naming.ts` は純関数のテスト
- 最後に `dropbox:check` と `dropbox:smoke` を本物の Dropbox に流す
