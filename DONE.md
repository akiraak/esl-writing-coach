# DONE

- 2026-11-08 アプリの機能を決める（ヒアリング → 機能案 → 確定。確定版は `CLAUDE.md` の「アプリの内容」、経緯は [plan](docs/plans/archive/app-features.md)）
- 2026-11-08 技術スタックを決める（API サーバ + 素の TypeScript の SPA。中身は `CLAUDE.md` の「技術スタック」、経緯は [plan](docs/plans/archive/tech-stack.md)）
- 2026-11-08 デザイン例を作って選ぶ（4 案から、構成は案 C・色合いは案 A に決定。マインドマップはアウトラインの編集でだけ使う。決定版は `docs/plans/archive/design-examples/decided.html`、経緯は [plan](docs/plans/archive/design-examples.md)）
- 2026-11-08 Dropbox への接続と読み書き（TypeScript の土台、daily-note から Dropbox クライアントを移植、パラグラフの保存層 `src/paragraphs/`、`dropbox:check` / `dropbox:smoke` で本物の Dropbox を確認。[plan](docs/plans/archive/dropbox-storage.md)）
- 2026-11-08 サーバと画面の土台（開く名前 `http://esl-writing.localhost:3016`、Host・Origin・専用ヘッダの安全チェック、JSON API、ハッシュで切り替える 1 ページ、`run-server.sh`。[plan](docs/plans/archive/app-foundation.md)）
- 2026-11-08 課題の入力（`assignment.md` の書式、課題の画面、自動保存の共通の仕組み、新規作成でテーマを書く API。[plan](docs/plans/archive/assignment-input.md)）
- 2026-11-08 一覧画面（カードにテーマ・4 段階の進み具合・更新日、ダイアログでテーマを聞く新規作成、確認つきの削除。一覧の API にテーマを足し、rev で覚えて読み直しを省く。[plan](docs/plans/archive/list-screen.md)）
- 2026-11-08 編集画面の骨組み（パラグラフを開いている間 4 つの段階の自動保存を持ち続け、段階の切り替えで読み直さない。タイルに状態の行と保存の印、ヘッダの保存の状態をまとめて表示、競合はその段階だけ読み直す、右ペインのタブ切り替え、ペインごとのスクロール。[plan](docs/plans/archive/edit-screen-frame.md)）
- 2026-11-08 アイデアのメモ（`ideas.txt` の自由テキスト。上に課題のテーマと条件の帯を出す（下書きでも使う部品 `src/browser/views/brief.ts`）。[plan](docs/plans/archive/ideas-memo.md)）
- 2026-11-08 アウトライン: daily-note のマインドマップを移植（`outline.ts`・`mindmap-layout.ts` とテストを `src/shared/` へ、`map.ts` は綴り・画像・AI・タッチを外して `mountMap()` の部品に。STEP 3 の画面は中心 = 意見の早見つき、`outline.txt` に字下げのテキストで保存。[plan](docs/plans/archive/outline-mindmap.md)）
- 2026-11-08 下書きエディタ（語数・文数のメーター（指定の幅の帯・あと N / 範囲内 / 多い）、日本語の注意、アウトラインを役割の色で並べたリスト。深さ → 役割は案 A（最後の子が「結論」で始まれば結論）。タイルのアウトラインは「理由 N」に。[plan](docs/plans/archive/draft-editor.md)）
- 2026-11-08 各 STEP の画面の下に次のステップへのボタン（中央のペインの一番下・右寄せ。段階を移ったらスクロールを先頭へ。中身がボタンに重なる・下書きのリストで欄ごと伸びる、を合わせて直した。[plan](docs/plans/archive/next-step-button.md)）
- 2026-11-08 下書きをプレーンテキストで書き出す（ヘッダと STEP 4 の下から開くダイアログ。確かめてからコピーか .txt で保存。未保存の分も含む・末尾を整える・日本語の注意。[plan](docs/plans/archive/export-plain-text.md)）
- 2026-11-08 学習ガイド（構成の解説・モデル文・表現集。モデル文はモックの題材で Claude が書いた 1 本に、アウトラインの見本とポイントを添えた。表現集は日本語の意味つき。学習ガイド画面と右ペインで共用、タブは共有。[plan](docs/plans/archive/learning-guide.md)）
- 2026-11-08 AI の採点と指摘（右ペインの「採点」タブ。固定基準 100 点・観点ごとの点数と一言・よかった点・指摘（直した文は出さない、本文に無い引用は消す）。Claude Opus 5.5・fallbacks: "default"。feedback.json に最新 1 回分。API キーは daily-note と共用。本物の API で 2 回確かめた。[plan](docs/plans/archive/ai-scoring.md)）
