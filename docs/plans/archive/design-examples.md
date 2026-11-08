# デザイン例を作って選ぶ

## 目的・背景

`CLAUDE.md` の「画面構成」で、実装の前に**デザイン例をいくつか作って選んでから**実装すると決めている。
対象は一覧画面・編集画面（3 ペイン）・学習ガイド画面。技術スタック（API + 素の TS の SPA）は決定済み。

## 対応方針

daily-note の `docs/design/` と同じやり方にする（置き場所だけ、project-manager の Plans タブで見られる `docs/plans/design-examples/` にする。開発途中のものなので specs ではなく plans に置く）。

- `docs/plans/design-examples/` に、単体で開ける静的 HTML のモックを案ごとに 1 ファイル置く（project-manager の Plans タブでモックとして見られる）
- 各モックは画面下の切り替えで **一覧 / 編集（下書き）/ 学習ガイド** を行き来できる（CSS だけで切り替え、JS は使わない）
  - 編集画面は最も情報が多い「下書き」段階を描く（左 = 段階の切り替え、中央 = 下書き + アウトラインの図、右 = 学習ガイド）
- 中身は全案で同じ架空のサンプル（テーマ「school uniforms」）。外部リソース（Web フォント・CDN）は読まない
- `docs/plans/design-examples/index.html` に案の一覧と比較表、`docs/plans/design-examples/README.md` に見方・論点・決定を書く
- PC 専用なのでレスポンシブは考えない（横幅 1280px 以上を想定）

### Phase 1: デザイン例を作る

4 案を作る。レイアウトの骨格（3 ペイン）は共通で、見た目・段階の切り替え方・語数の見せ方・一覧の形を変える。

### Phase 2: ユーザーが選ぶ

見比べてもらい、1 案を選ぶ（組み合わせも可）。

### Phase 3: 決定を記録する

`docs/plans/design-examples/README.md` に決定と実装で守ることを書き（決定版のモック `decided.html` も作る）、`CLAUDE.md` の「画面構成」に決定の要点を書く。完了したらプランと `design-examples/` を一緒に `docs/plans/archive/` へ移す。

## 結果（2026-11-08）

- 4 案（A ノート / B エディタ / C ワークブック / D フォーカス）を作り、長所・短所を比べた
- ユーザーの決定: **構成は C、見た目は A の色合いに寄せる。マインドマップは編集用のみでよい**
- 決定版のモック `design-examples/decided.html` を作り、`CLAUDE.md` の「画面構成」と `design-examples/README.md` に記録した
- 実装で決めること（深さ → 役割の規則、一覧の進み具合の判定）は `TODO.md` の該当タスクに書いた

## 影響範囲

- 新規: `docs/plans/design-examples/`（モックと README）
- `CLAUDE.md` の「画面構成」に決定を追記
- コードには手を入れない

## テスト方針

静的なモックなのでテストは無し。ブラウザで開いて各画面の切り替えが動くことを確認する。
