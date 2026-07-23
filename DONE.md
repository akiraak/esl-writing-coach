# DONE

- [x] 2026-07-22 デザインをかっこよくする。入力と出力を分かりやすく色を変える [plan](docs/plans/archive/visual-redesign.md)
  - [x] style.css を CSS 変数ベースで全面刷新（slate ニュートラル + 入力=インディゴ / AI 出力=バイオレット）
  - [x] サイドバー開閉を width トランジションでアニメーション化
  - [x] ヘッドレス Chromium で各状態のスクリーンショット確認

- [x] 2026-07-22 左ペインを閉じるボタンは２つのペインの間に分かるように入れる [plan](docs/plans/archive/sidebar-toggle-divider.md)

- [x] 2026-07-22 画面を１つにする。左ペインに記事一覧で右に記事編集。左ペインは折りたためる [plan](docs/plans/archive/single-page-layout.md)
  - [x] HTML/CSS: index.html を単一画面（左サイドバー + 右エディタ）に書き換え、article.html を削除
  - [x] JS: index.js + article.js を app.js に統合（記事切り替え・折りたたみ・URL 同期）
  - [x] 動作確認: typecheck + ヘッドレス Chromium で一覧選択・自動保存・折りたたみ・削除を確認

- [x] 2026-07-22 出力ペインの見出しを短縮（AI の添削済み英文 → 添削済み英文 / AI からのアドバイス → アドバイス）[plan](docs/plans/archive/shorten-output-labels.md)

- [x] 2026-07-22 入力欄と添削英文に word 数を表示 [plan](docs/plans/archive/word-count.md)

- [x] 2026-07-22 レイアウトを見やすくする [plan](docs/plans/archive/editor-layout-redesign.md)
  - [x] article.html: ルールを折りたたみ化し、入力 / AI アウトプットの 2 カラム構造へ組み替え
  - [x] style.css: 折りたたみ・2 カラムグリッド・グループ見出しのスタイル実装
  - [x] 動作確認（自動保存 → 添削の動線・レスポンシブ）

- [x] 2026-07-22 タイトルは必要ない [plan](docs/plans/archive/remove-title.md)

- [x] 2026-07-22 実 API キーでの添削動作確認（claude-sonnet-5 で POST /correct を実行し、添削済み英文と日本語アドバイスが保存されることを確認）

- [x] 2026-07-22 webアプリの作成 [plan](docs/plans/archive/web-app.md)
  - [x] Phase 1: バックエンド土台（backend/ 雛形・Express 起動・静的配信・DB 初期化）
  - [x] Phase 2: 記事 CRUD API
  - [x] Phase 3: フロント 2 画面（記事一覧・編集 4 欄 + 自動保存）
  - [x] Phase 4: 添削（Claude 連携・自動保存後に実行）
  - [x] Phase 5: 仕上げ（挙動調整・README・curl での API テスト。実キーでの添削確認は TODO に分離）
- [x] 2026-07-22 このプロジェクトの内容をCLAUDE.mdに書く
