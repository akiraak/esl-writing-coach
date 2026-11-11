# 保存先を Dropbox からローカルの SQLite に移す

## 目的・背景

- Dropbox からの読み込みが遅い（2026-11-11 実測: 一覧 0.5〜0.6 秒、段階 1 つ 0.47〜0.78 秒、採点 0.46 秒）。開くたびに待たされる
- AI案（テーマの候補・理由と例の候補・アウトラインの指摘）が画面を切り替えると消える（調査は `docs/plans/archive/keep-ai-ideas.md`）
- 検討の結果、**全てを SQLite に入れる案 F** に決めた（2026-11-11）。別の PC では使わない・`outline.txt` を daily-note のマップで開かない、をユーザーに確かめた

## 対応方針

### 決めたこと

- **SQLite**: Node 22 に入っている `node:sqlite`（`DatabaseSync`）。依存は増やさない。試験段階の警告は `--disable-warning=ExperimentalWarning` で消す
- **DB のファイル**: `data/esl-writing.db`（リポジトリの直下。`.gitignore`）。`ESL_DB_PATH` で変えられる。WAL モード。**Dropbox のフォルダには置かない**
- **表**
  - `paragraphs(id PK, created_on, created_at, deleted_at)`
  - `stages(paragraph_id, stage, text, version, updated_at)` 主キー `(paragraph_id, stage)`
  - `feedbacks(paragraph_id PK, json, updated_at)`（採点の最新 1 回分）
  - `ai_results(paragraph_id, kind, json, created_at)` 主キー `(paragraph_id, kind)`。`kind` = `themes` / `ideas` / `outline`。`json` は入力と結果
  - `meta(key PK, value)`（スキーマの版・最後のバックアップの日付）
- **競合の判定は残す**: `rev` に `version`（保存のたびに 1 増える）の文字列を入れる。`UPDATE ... WHERE version = ?` が 0 行なら 409。
  rev が null の保存は「まだ無いときだけ作る」（Dropbox の `add` と同じ）
- **削除は印を付けるだけ**（`deleted_at`）。一覧・読み込みには出さない。同じ id は使い回さない。戻すときは SQL で印を消す
- **改行コード・BOM の扱い（`format`）をやめる**: ほかのアプリで開かないので、本文はブラウザから来た LF のまま持つ。API の `format` も外す
- **一覧のテーマ・振り返り**: 読み置き（`themes.ts`・`feedbacks.ts`）をやめ、毎回 DB から読む（速いので要らない）
- **AI案を保存する**: `POST /api/ai/*` に `id`（パラグラフ）を付けたら、AI の呼び出しが終わったときにサーバが `ai_results` に書く。
  `GET /api/paragraphs/:id/ai` で 3 種類をまとめて返す。ブラウザは開いたときに描き直し、出したときの入力と今が違えば知らせる。
  呼び出し中に画面を離れて戻ったときのため、呼び出し中の Promise はブラウザのメモリにパラグラフごとに持つ
- **バックアップ**: サーバは起動時と 1 時間ごとに「今日のバックアップがまだ無ければ」`VACUUM INTO` で DB を 1 ファイルにし、
  Dropbox の `/akira/Documents/esl-writing/backups/esl-writing-YYYY-MM-DD.db` に上げる（`add`。既にあれば今日は済み）。新しい 30 個を残して古いものは消す。
  Dropbox の設定が無ければバックアップだけ止めて warn。`npm run db:backup` で今すぐ上げられる
- **今の Dropbox のデータ**: 1 回だけ動かすスクリプトで DB に移す（Dropbox は読むだけ。消さない）。段階の更新時刻は Dropbox の `server_modified` を引き継ぐ

## Phase

### Phase 1: SQLite の保存層

- `src/db/database.ts`（開く・表を作る）、`src/db/store.ts`（`ParagraphStore` の SQLite 版: 一覧・段階の読み書き・作成・削除・採点・AI案）
- テスト: `:memory:` で、作成・同名の `-2`・保存と競合・削除の印・一覧の進み具合と更新日とテーマ・採点・AI案

### Phase 2: 差し替えと AI案の保存

- `src/main.ts` を SQLite に。API から `format` を外し、`themes.ts`・`feedbacks.ts`・`paragraphs/store.ts`（Dropbox 版）・`text.ts` を消す
- `SavedStage` は `{ rev, updatedAt }`、`ParagraphSummary` は `{ id, createdOn, updatedAt, started }`
- AI案: `GET /api/paragraphs/:id/ai`、`POST /api/ai/*` の `id`。`ideas-pane.ts` の描き直し・古さの知らせ・呼び出し中の共有
- テストを直す（`server.test.ts`・`autosave.test.ts`。`paragraph-store.test.ts`・`themes.test.ts`・`stage-text.test.ts` は消す）

### Phase 3: Dropbox からの移し替え

- `src/scripts/import-dropbox.ts`（`npm run db:import`）: `paragraphs/` を辿って段階のファイルと `feedback.json` を読み、DB に入れる。
  既に DB にある id は飛ばす（何度流しても同じ）。BOM と CRLF は落とす
- 実データで流し、件数と中身を確かめる

### Phase 4: Dropbox へのバックアップ

- `src/db/backup.ts`（純粋な部分: ファイル名・残す数の選び方はテスト）、サーバへの組み込み、`npm run db:backup`
- 本物の Dropbox に 1 回上げて確かめる

### Phase 5: 後片付け

- `dropbox:check`・`dropbox:smoke`・移し替えのスクリプトを消す（移し替えは git の履歴に残る）
- `run-server.sh`・`package.json` に警告を消すオプション、`.gitignore` に `data/`、`.env.example`
- CLAUDE.md の「データ保存」「ファイルの配置」「技術スタック」「コードの置き場所」「開発コマンド」を書き直す
- サーバを立ち上げ直し、ブラウザで一通り確かめる

## 影響範囲

- サーバ: `src/main.ts`・`src/config.ts`・`src/server/api.ts`・新規 `src/db/`・`src/paragraphs/`（`naming.ts` だけ残す）・`src/scripts/`
- 共有: `src/shared/types.ts`・`src/shared/autosave.ts`
- ブラウザ: `src/browser/api.ts`・`stage-editor.ts`・`ideas-pane.ts`・`views/edit.ts`
- Dropbox のクライアント（`src/dropbox/client.ts`）はバックアップと移し替えのために残す

## テスト方針

- DB の保存層・API は `:memory:` の DB で `node --test`（Dropbox も AI も叩かない）
- バックアップは偽の Dropbox クライアントで（上げる・既にあれば飛ばす・古いものを消す）
- 本物で確かめるのは、移し替え（Dropbox は読むだけ）とバックアップ 1 回
- ブラウザで: 一覧・作成・削除・段階の保存・タブ 2 つでの競合・採点の表示・振り返り・AI案が画面を移っても残ること

## 結果（2026-11-11）

- Phase 1〜5 を実装。Dropbox の保存層（`store.ts` の Dropbox 版・`themes.ts`・`feedbacks.ts`・`text.ts`）と `dropbox:check`・`dropbox:smoke` を消した
- Phase 3: 実データは 1 件（課題・アウトライン）。サーバを止めて移し、Dropbox の中身と API の中身が一致することを確かめた。移し替えのスクリプトは消した（git の履歴にある）
- Phase 4: 起動時に本物の Dropbox の `/akira/Documents/esl-writing/backups/esl-writing-2026-11-11.db`（45 KB）に上がった。変わっていなければ上げない
- 速さ: 一覧 0.50〜0.60 秒 → 4〜9 ミリ秒、段階 1 つ 0.47〜0.78 秒 → 2 ミリ秒
- ブラウザ（Playwright・偽の AI・一時 DB）で確かめた: 一覧・下書きの自動保存と再読み込み・AI案が学習ガイド／一覧／振り返りへ移って戻っても残る・
  呼び出し中に離れて戻ると「考えています…」の続きから結果が出る・再読み込みでも残る・テーマを変えると古さの知らせ・別のタブの古い rev は競合で上書きしない・削除
