# 技術スタックを決める

## 目的・背景

MVP の実装（Dropbox の読み書き・一覧・編集画面・マインドマップ移植など）に入る前に、言語・サーバ・画面の作り方・ビルド・テストを決める。条件は次のとおり（`CLAUDE.md`）。

- 自分専用・PC のブラウザだけ・ローカルで動かす（認証なし）
- データは Dropbox API で読み書きする（daily-note の `src/dropbox/client.ts` の方式を踏襲）
- アウトラインは daily-note のマインドマップを移植する（`src/editor/outline.ts`・`src/editor/mindmap-layout.ts`・`src/browser/map.ts`）
- 編集画面は 3 ペイン。段階ごとに別ファイルを自動保存し、`rev` で競合を判定する
- 後で AI（Claude API）の採点・アイデア出しを足す

## 調査結果（移植元 daily-note）

- 構成: Node 22 + TypeScript、`node:http`（フレームワーク無し）、画面はサーバで HTML を組む（SSR）、
  ブラウザ用コードは esbuild で IIFE に束ねる、テストは `node --test`、lint は Biome
- `outline.ts`（471 行）・`mindmap-layout.ts`（179 行）は **DOM を使わない純関数**。node のテストで確かめられる
- `map.ts`（1153 行）は **素の TS で DOM / SVG を直接操作**する。フレームワークに依存しない。
  正は textarea で、`mount.ts` の `bindSource` で textarea に被せ、変更のたびに全文を書き戻して `input` を発火する。
  綴りの確認（`mindmap-spell.ts` など）と画像の書き出しにも依存しているが、外せる
- `client.ts`（351 行）は Node の `fetch` だけで動き、`config.ts`・`log.ts` に軽く依存する

## 候補

| 案 | サーバ | 画面 | ビルド | マップの移植 |
|---|---|---|---|---|
| A. daily-note と同じ | Node 22 + TS、`node:http` | サーバで HTML を組む（SSR）+ 部分的に JS | tsc + esbuild | そのまま |
| B. API + 素の TS の SPA | Node 22 + TS、`node:http`（JSON API） | ブラウザ側で描く 1 ページ（素の TS） | tsc + esbuild | ほぼそのまま |
| C. API + React の SPA | Node 22 + TS（JSON API） | React + Vite | tsc + Vite | ref で DOM に被せる |

テスト（`node --test`）・lint（Biome）・Dropbox クライアント・Claude API（`@anthropic-ai/sdk`）はどの案でも共通。

## 決定

2026-11-08、**B（API + 素の TS の SPA）** に決定。A・B の比較を見たうえでユーザーが選んだ。

- 決め手: 編集画面は 1 画面で 4 ファイル（課題・アイデア・アウトライン・下書き）を行き来し、ファイルごとに自動保存する。
  daily-note の「1 画面 = 1 ファイル」の SSR とは形が違い、A では段階の切り替えがページ遷移になる。
  さらに下書き横のアウトライン表示・語数の表示・AI の結果表示でブラウザ側のコードも増え、画面のコードがサーバとブラウザに散る
- 引き換え: daily-note の画面と自動保存のコードは流用できず書き直す。マップと Dropbox クライアントはどちらの案でも流用できるので差にならない
- 中身は `CLAUDE.md` の「技術スタック」節に書いた

## 影響範囲

- `CLAUDE.md` の「技術スタック」節を埋める
- 以降の実装タスク（`TODO.md` の「実装（MVP）」）すべての前提になる

## テスト方針

決定だけでコードは書かないため、テストは無し。実装の初回タスクで、DOM を使わない部分を `node --test` で確かめる土台を作る。
