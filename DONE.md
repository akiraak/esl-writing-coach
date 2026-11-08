# DONE

- 2026-11-08 アプリの機能を決める（ヒアリング → 機能案 → 確定。確定版は `CLAUDE.md` の「アプリの内容」、経緯は [plan](docs/plans/archive/app-features.md)）
- 2026-11-08 技術スタックを決める（API サーバ + 素の TypeScript の SPA。中身は `CLAUDE.md` の「技術スタック」、経緯は [plan](docs/plans/archive/tech-stack.md)）
- 2026-11-08 デザイン例を作って選ぶ（4 案から、構成は案 C・色合いは案 A に決定。マインドマップはアウトラインの編集でだけ使う。決定版は `docs/plans/archive/design-examples/decided.html`、経緯は [plan](docs/plans/archive/design-examples.md)）
- 2026-11-08 Dropbox への接続と読み書き（TypeScript の土台、daily-note から Dropbox クライアントを移植、パラグラフの保存層 `src/paragraphs/`、`dropbox:check` / `dropbox:smoke` で本物の Dropbox を確認。[plan](docs/plans/archive/dropbox-storage.md)）
- 2026-11-08 サーバと画面の土台（開く名前 `http://esl-writing.localhost:3016`、Host・Origin・専用ヘッダの安全チェック、JSON API、ハッシュで切り替える 1 ページ、`run-server.sh`。[plan](docs/plans/archive/app-foundation.md)）
- 2026-11-08 課題の入力（`assignment.md` の書式、課題の画面、自動保存の共通の仕組み、新規作成でテーマを書く API。[plan](docs/plans/archive/assignment-input.md)）
- 2026-11-08 一覧画面（カードにテーマ・4 段階の進み具合・更新日、ダイアログでテーマを聞く新規作成、確認つきの削除。一覧の API にテーマを足し、rev で覚えて読み直しを省く。[plan](docs/plans/archive/list-screen.md)）
