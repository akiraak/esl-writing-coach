# サーバと画面の土台

## 目的・背景

保存層（`src/paragraphs/`）はできた（`docs/plans/archive/dropbox-storage.md`）。次の画面のタスク（課題の入力・一覧・編集画面）を
1 つずつ足していけるよう、その下に共通の土台を作る: **API サーバ・ブラウザ側の 1 ページ・起動の仕方・開く名前**。
これが終わると、ブラウザで開いて Dropbox の一覧が出る最小のアプリになる。

技術スタックは `CLAUDE.md` の「技術スタック」（Node 22 + `node:http` の JSON API、素の TS を esbuild で束ねた SPA）。

## 対応方針

### Phase 1: 開く名前と安全チェック

- 開く名前は **`http://esl-writing.localhost:3016`**（2026-11-08。project-manager の `project-manager.localhost:8200` にならう）。
  `*.localhost` はブラウザが DNS を引かずに自分の PC に向けるので、hosts などの設定は要らない。`127.0.0.1:3016`・`localhost:3016` でも開ける
- 認証が無く Dropbox に書き込むので、project-manager の `guard.ts` と同じ安全チェックを置く（`src/server/guard.ts`）
  - **Host** が `127.0.0.1` / `localhost` / `esl-writing.localhost`（とこのポート）のときだけ受ける（DNS rebinding 対策）
  - **Origin** が付いていれば同じオリジンのときだけ
  - 書き込み（GET / HEAD 以外）は **`X-ESL-Request: 1` と `Content-Type: application/json`** を必須にする（別のサイトのページは事前確認なしに付けられず、CORS は許さない）
- 待ち受けは `127.0.0.1`。macOS は `*.localhost` を `::1` に先に引くことがあるので、`::1` でも待ち受ける（開けなければ warn を出して `127.0.0.1` だけ）
- CSP: `default-src 'self'`、インラインのスクリプト・スタイルは使わない、`frame-ancestors 'none'`

### Phase 2: JSON API

`src/server/api.ts`。保存層をそのまま呼ぶ。

| メソッド・パス | 内容 |
|---|---|
| `GET /api/paragraphs` | 一覧（`listParagraphs()`） |
| `POST /api/paragraphs` `{ theme }` | 新規作成（作成日はサーバの今日・ローカル時刻）→ `{ id }` |
| `DELETE /api/paragraphs/:id` | 削除 |
| `GET /api/paragraphs/:id/stages/:stage` | 段階のファイル → `{ text, rev, format }` |
| `PUT /api/paragraphs/:id/stages/:stage` `{ text, rev, format }` | 保存 → `{ rev, size, serverModified }`。**競合は 409 `{ error: 'conflict' }`** |

- 不正な id・段階・本文は 400、Dropbox の失敗は 502（メッセージは `describeError` を通す。本文はログに出さない）
- 本文の上限は 1MB（パラグラフ 1 つには十分）

### Phase 3: ブラウザ側の 1 ページ

- `web/index.html`（外枠）と `web/style.css`（決定版のデザインの色・フォントを CSS 変数に）。esbuild で `src/browser/main.ts` を `dist/browser/app.js` に束ねる
- 画面の切り替えは URL のハッシュ（`#/` = 一覧、`#/p/<id>/<stage>` = 編集、`#/guide` = 学習ガイド）。サーバは `/` だけを返せばよい
- `src/browser/api.ts`: API を呼ぶ関数（`X-ESL-Request` を付ける）。各画面のタスクから使う
- この Phase では外枠（ヘッダ・3 画面の器）と、一覧に id と更新日を出すところまで。カード・新規作成などの中身は「一覧画面」のタスクで作る
- `tsconfig.web.json` でブラウザ向けを型チェックする（daily-note と同じ）

### Phase 4: 起動

- `src/main.ts`（設定を読み、保存層を作って待ち受ける）、`npm start`
- `run-server.sh`: ビルドしてから起動。そのポートを掴んでいる前回のプロセスがいれば止めてから起動する（daily-note の `run-dailynote.sh` にならう）。
  project-manager の `projects.yaml` の起動コマンド（`PORT=3016 ./run-server.sh`）と合わせる

## 結果（2026-11-08）

- 4 Phase とも完了。`npm test` 92 件・`npm run lint`・`npm run typecheck`（ブラウザ向けを含む）が通る
- `./run-server.sh` で起動し、`http://esl-writing.localhost:3016/` が開けた（curl とヘッドレスの Chromium。コンソールのエラーなし）。
  一覧（0 件）・編集の 3 ペイン（まだ無いファイルは「まだありません」）・学習ガイドの器が出る
- 本物のサーバで、Host が違えば 403、`X-ESL-Request` の無い書き込みは 403 を確かめた
- サーバと画面で共有する型を `src/shared/types.ts` に切り出した（`store.ts` は Node に依存するので、ブラウザ向けの型チェックに入れられないため）
- 新規作成の作成日はサーバのローカル時刻（OS のタイムゾーン。この PC は America/Los_Angeles）。日本時間に固定するかは決めていない
- 段階のタイルの「日本語可」の印が、ファイル名が長い課題（`assignment.md`）で折り返す。編集画面の骨組みのタスクで直す

## 影響範囲

- 新規: `src/server/`・`src/browser/`・`src/main.ts`・`web/`・`run-server.sh`・`tsconfig.web.json`、devDependencies に esbuild
- `CLAUDE.md`: 開く名前・安全チェック・API・開発コマンドを追記
- `TODO.md`: このタスクを「実装（MVP）」の先頭に足す

## テスト方針

- `guard`: Host・Origin・書き込みのヘッダの組み合わせ（純関数にしてテスト）
- API: 偽の保存層を差し込んだサーバを空きポートで立て、`fetch` で叩く（一覧・作成・削除・読み込み・保存・競合 409・不正な id 400・Host が違えば 403）
- 最後に `./run-server.sh` で起動し、ヘッドレスのブラウザで `http://esl-writing.localhost:3016` を開いて一覧（0 件）が出ることを確かめる
