# DONE

- [x] 2026-07-23 本番モバイルの「記事の作成に失敗しました（通信エラー）」を解明・対策（Cloudflare Access のセッション切れ。検知したら書きかけを退避して自動リロード → 再認証 → 復元）[plan](docs/plans/archive/access-session-expiry.md)

- [x] 2026-07-23 削除確認を独自ダイアログ化 + 作成/削除の失敗理由を表示（confirm() の「ダイアログを表示しない」問題の解消、エラーに HTTP xxx / 通信エラーを付加）[plan](docs/plans/archive/custom-confirm-and-error-detail.md)

- [x] 2026-07-23 記事一覧のクリックがときどき効かない問題の修正（自動保存ごとの一覧全再構築でクリック中の要素が消えていた → id ベースの差分更新に変更）[plan](docs/plans/archive/article-list-click-loss.md)

- [x] 2026-07-23 「新規作成ボタンが反応しない」の調査 + 失敗時のエラー表示を追加（ボタン自体は正常。API 不達時に無言で失敗していたため、ステータス欄に「記事の作成に失敗しました」を表示）[plan](docs/plans/archive/new-article-error-feedback.md)

- [x] 2026-07-23 topbar の ✎ ロゴアイコンを削除（ボタンに見えるがタップしても反応しないため）[plan](docs/plans/archive/remove-topbar-logo.md)

- [x] 2026-07-23 モバイル対応の実装（サイドバーのドロワー化・入力体験の調整。本番反映 + iPhone 実機確認は TODO に残す）[plan](docs/plans/archive/mobile-support.md)
  - [x] Phase 1: サイドバーのドロワー化（ハンバーガー + オーバーレイ、記事選択で自動クローズ）
  - [x] Phase 2: 入力体験・細部の調整（dvh・16px・ダイアログ全画面化・タップターゲット）
  - [x] Phase 3: 検証（ヘッドレス Chromium 390x844 / 1280x800、17 項目 + スクリーンショット目視。本番反映は未実施）

- [x] 2026-07-23 シード記事に添削済み英文とアドバイスも入れる（初めて開いたときから出力欄を表示。中身は実際の添削 API の出力を焼き込み）[plan](docs/plans/archive/seed-with-correction-output.md)

- [x] 2026-07-23 デフォルトで追加されてる記事を用意する。ルールとユーザー入力を事前に入れておく（新規・既存ユーザーとも 1 回だけシード）[plan](docs/plans/archive/default-article-seed.md)

- [x] 2026-07-23 認証を入れる。Cloudflare Access で Google 認証。複数ユーザー対応 [plan](docs/plans/archive/google-auth-cloudflare-access.md)
  - [x] Phase 1: Cloudflare 側の設定手順のドキュメント化（[docs/specs/cloudflare-access-setup.md](docs/specs/cloudflare-access-setup.md)。実設定作業は TODO に残す）
  - [x] Phase 2: バックエンドの JWT 検証ミドルウェア（jose・DEV フォールバック）
  - [x] Phase 3: DB のマルチユーザー化（users テーブル・articles.user_id・repo/API のスコープ化）
  - [x] Phase 4: フロントエンド最小対応（/api/me・メール表示・ログアウトリンク）

- [x] 2026-07-22 添削済みとアドバイスをマークダウン形式で見やすく表示（コピペは表示テキストのみ）[plan](docs/plans/archive/markdown-output.md)

- [x] 2026-07-22 「AIルール」の表記を「ルール」に短縮（グループ見出し「AI」との重複解消）[plan](docs/plans/archive/rename-rules-label.md)

- [x] 2026-07-22 グループ見出し「AI のアウトプット」を「AI」に短縮 [plan](docs/plans/archive/shorten-ai-group-title.md)

- [x] 2026-07-22 AIルールの説明文の先頭に「空欄のままでも大丈夫」を明記 [plan](docs/plans/archive/rules-help-optional-note.md)

- [x] 2026-07-22 AIルールダイアログを少し小さくし、ボタンから開くアニメーション + 新規作成時のボタン強調を入れる [plan](docs/plans/archive/rules-dialog-animation.md)

- [x] 2026-07-22 AIルールダイアログをできるだけ大きくする [plan](docs/plans/archive/rules-dialog-maximize.md)

- [x] 2026-07-22 文章生成ルールを「AIルール」として AI グループのボタン + ダイアログ形式にする（新規作成時は自動で開く。AI がルールに沿って添削・アドバイスすることを明記）[plan](docs/plans/archive/rules-dialog.md)

- [x] 2026-07-22 文章生成ルールは新規作成直後は目立つように開いておく [plan](docs/plans/archive/open-rules-on-new-article.md)

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
