# esl-writing-coach

ESL（英語を第二言語として学ぶ）の授業で課されるパラグラフ（英語の段落）ライティングを、学びながら書くためのツール。

## 前提

- **自分専用**: マルチユーザー・認証・一般公開は想定しない
- **PC 専用**: デスクトップブラウザでの利用のみを想定する。モバイル・タブレット対応（レスポンシブ、タッチ操作）は行わない
- **ローカルで動かす**: 自分の PC 上でだけ動かし、認証は付けない（2026-11-08 決定）。公開サーバには置かない
- 2026-11-07 にゼロから作り直しを開始した。旧実装（Express + 素の JS + SQLite）は commit `5938c9d` 以前の git 履歴から参照できるが、構成は引き継がない前提で再設計する

## アプリの内容

2026-11-08 に決定（経緯は `docs/plans/archive/app-features.md`）。

### 書く流れ

1 つの課題につき **1 パラグラフ**を作る。授業で書くのは **opinion paragraph** だけ。パラグラフは次の 3 段階で書き、どの段階にもいつでも戻れる。

| 段階 | やること | 言語 |
|---|---|---|
| 1. 課題 | テーマ（自分で決める）と、課題の条件（語数・文数の指定、構成や表現の条件）を入力する | 条件は日本語でも可 |
| 2. アウトライン | マインドマップの上でアイデアを出しながら骨組みを作る。中心 = 意見（topic sentence の元）、子 = 理由、孫 = 例・詳細、最後に結論 | 日本語可 |
| 3. 下書き・推敲 | 英語で本文を書いて直す | **英語のみ** |

2026-11-09、アイデア（自由テキストのメモ）の段階をなくし、最初からアウトラインを作るようにした（メモとマップに繋がりが無く、最終の目的はアウトラインのため。`docs/plans/ideas-outline.md`）。
以前の `ideas.txt` は Dropbox に残っていてもアプリは読まない。旧 URL の `#/p/<id>/ideas` はアウトラインとして開く。

### 最初に作るもの（MVP）

**AI の機能は極力入れない**。AI は後から足していく。

- **一覧画面**: パラグラフの一覧（テーマ・更新日）、新規作成、削除
- **課題の入力**: テーマ、語数・文数の指定、構成や表現の条件
- **アウトライン（マインドマップ）**: daily-note のマップ機能を移植する。正は字下げのテキストで、図はその見え方（座標は保存しない）。移植元は daily-note の `src/editor/outline.ts`・`src/editor/mindmap-layout.ts`・`src/browser/map.ts`（移植済み。移植先は `src/shared/outline.ts`・`src/shared/mindmap-layout.ts`・`src/browser/map.ts`）
- **下書きエディタ**: 語数・文数を常に表示し、課題の指定に足りない／超えたことが分かるようにする。アウトラインを並べて見ながら書ける（図ではなく、構成の役割の色で並べたリスト）
  - 数え方（2026-11-08。`src/shared/counting.ts`）: 語 = 英字・数字のひと続き（`don't`・`well-known`・`3.5`・`50,000` は 1 語）。文 = `.`・`!`・`?` のあとに空白か終わり。`Mr.` などの敬称は終わりにせず、`etc.`・`e.g.` などは次が大文字か終わりのときだけ。句点の無い最後の文も 1 文。日本語が混じっていれば注意を出す
  - **深さ → 役割**（2026-11-08 決定。`src/shared/outline-roles.ts`）: 中心 = Topic sentence、子 = Reason、孫より深いもの = Example。中心の子のうち**最後のもの**の名前が「結論」「まとめ」「Conclusion」で始まっていれば結論（子孫も）。字下げ 0 の行が 2 つ以上なら、それぞれを Topic sentence として並べる
- **自動保存**: daily-note と同じく、打ち終わって数秒で Dropbox に保存する。`rev` が合わなければ止めて知らせる（「データ保存」の節）
- **書き出し**: 下書きを**プレーンテキスト**で書き出す。ヘッダの「書き出し」と STEP 3 の一番下から開くダイアログで確かめてから「テキストをコピー」か「.txt で保存」（名前はパラグラフの id）。手元の最新（未保存の分も含む）を、末尾の空白・空行を落として改行 1 つで終える（`src/shared/export.ts`）。本文はサーバへ送らない
- **学習ガイド**: 書いている途中でも横に開ける
  - 構成の解説: opinion paragraph の型（topic sentence / reasons / examples / concluding sentence）
  - モデル文: 構成ごとに色分けしたお手本のパラグラフ。題材はモックと同じ「High school students should have part-time jobs」で、英文は Claude が書いた 1 本（2026-11-08 決定）。そのモデル文のアウトライン（STEP 2 の見本）と書き方のポイントも添える
  - 表現集: 意見・理由・例・結論を述べる定型表現と transition words（日本語の意味つき）

### 後で足すもの

- **AI の採点と指摘**: 「採点する」ボタンで実行する（自動では走らせない）。アプリ内の固定基準で 100 点満点を付け、観点ごとの内訳も出す。指摘には観点ラベルとヒントを付け、**直した文そのものは出さない**（課題として自分で書くため）。本文に日本語が混じっていれば指摘する。結果は最新の 1 回分だけを持つ
  - 固定基準: 構成 30 / 内容 25 / 文法 20 / 語彙・表現 15 / 課題の条件 10（観点ごとに見ることは `src/ai/scoring.ts` のプロンプト。合計はアプリが足す）
  - 実装（2026-11-08。`docs/plans/archive/ai-scoring.md`）: 編集画面の右ペインの「採点」タブ。モデルは `claude-opus-5-5`・effort `high`、拒否されたらサーバ側の `fallbacks: "default"` で別のモデル。
    押したら手元の未保存を保存し終えてから、サーバが Dropbox の下書きと課題を読んで採点し `feedback.json` に書く（採点した本文も入れ、後で本文が変わったら知らせる）。
    送るのは下書き・課題・アプリが数えた語数と文数だけ（アイデア・アウトラインは送らない）。`ANTHROPIC_API_KEY` が無ければ採点だけ使えない
    **指摘の引用が本文に無ければ消す**（AI が誤りを直した形で引用すると直した文が出てしまうため。`dropUnquotable`）。API キーは daily-note と共用（2026-11-08 決定）
- **AI のアイデア出し**: テーマ候補、理由・例の候補を出す。アウトラインへは自動で書き込まない
  - 実装（2026-11-08。`docs/plans/archive/ai-ideas.md`）: 編集画面の右ペインの「AI案」タブ。テーマの候補は分野・キーワード（任意）から英語の問いと日本語訳（「課題のテーマにする」で書き換え）。
    理由・例の候補は課題のテーマと条件から、賛成・反対それぞれ理由 3 つと例を**日本語で**（英文は出さない。見るだけ。2026-11-09 にメモをなくしたので「メモに足す」を外した。マップに直接足すのは後で）。
    押したときだけ呼び、結果は保存しない。送るのは分野・キーワード、テーマと条件だけ。モデルは採点と同じで effort `medium`
- **`.docx` / PDF の書き出し**と体裁（2026-11-08 実装。`docs/plans/archive/docx-pdf-export.md`）: 書き出しのダイアログの「提出用のファイル」。
  体裁は A4・余白 1 インチ・Times New Roman 12pt・行間 2 行、左上に名前・クラス・日付（入れたものだけ。名前とクラスはブラウザに覚える）、テーマを中央のタイトル、段落の頭を 0.5 インチ下げる（`src/shared/document.ts`）。
  .docx はブラウザの中で最小の OOXML を無圧縮 ZIP に詰めて作る（ライブラリなし。`src/shared/docx.ts`）。PDF はブラウザの印刷（「PDF に保存」。`src/browser/print.ts` と印刷の CSS）
- **間違いの振り返り**: 全パラグラフの最新の指摘・点数を観点別に集める
  - 実装（2026-11-08。`docs/plans/archive/review.md`）: `#/review`（ヘッダの「振り返り」）。採点したパラグラフの数・合計の平均・観点ごとの平均と「伸ばしたいところ」（満点に対する割合がいちばん低い観点）・
    点数の推移（採点した日の古い順の表）・よくする間違い（観点ごとの指摘）。`GET /api/review` が採点のあるパラグラフの `feedback.json` を id + rev で覚えて読み（`src/paragraphs/feedbacks.ts`）、集計はブラウザ（`src/shared/review.ts`）
- **アウトライン段階での AI の指摘**（2026-11-08。`docs/plans/archive/outline-ai-feedback.md`）: 2 段。
  (1) 型のチェック（AI なし）: アウトラインの画面に意見が 1 つ／理由が 2〜3 つ／どの理由にも例／結論を ✓ / ! で出し、マップを直すたびに更新（`src/shared/outline-checks.ts`）。
  (2) AI の指摘: 右ペインの「AI案」の「アウトラインを見てもらう」。テーマ・条件・アウトラインを送り、全体の一言と指摘（引用・ヒント）を日本語で。直した項目は出さず、アウトラインに無い引用は消す。保存しない
- **表現集から下書きへの挿入**（2026-11-08 実装。`docs/plans/archive/insert-phrase.md`）: 右ペインの表現集の表現を押すと、下書き（STEP 3）を開いていれば本文のカーソルの位置に入る（前後の空白は `src/shared/insert.ts`、Ctrl+Z で戻せる）。下書き以外では知らせるだけ。学習ガイド画面では押せない

### 画面構成

PC の横幅を使う。2026-11-08、デザイン例 4 案から **構成は案 C（ワークブック）、色合いは案 A（ノート）** に決定。
決定版のモックは `docs/plans/archive/design-examples/decided.html`（4 案と比較・経緯は同じフォルダの `README.md`）。

- **一覧画面**: パラグラフのカード（テーマ・更新日・3 段階の進み具合）と「新規作成」。ヘッダから学習ガイドへ移れる
- **編集画面**: 3 ペイン
  - 左 = 段階のタイル（STEP 1〜3。各段階の状態と「日本語可 / 英語のみ」の印）
  - 中央 = 選んだ段階の編集欄。一番下に「STEP 2 アウトラインへ →」のような次のステップへのボタン（STEP 3 は「書き出し →」。2026-11-08 要望）。アウトラインでは上に課題のテーマと条件の帯。下書きでは、上に語数・文数のメーター（課題の指定の幅を示す）と課題の条件、本文の右にアウトラインを**構成の役割の色で並べたリスト**（見るだけ）
  - 右 = 学習ガイド（構成 / モデル文 / 表現集の切り替え。常に表示。AI を足したら AI の結果もここに出す）
- **学習ガイド画面**: 構成の解説 / モデル文 / 表現集のタブ。編集画面の右ペインでも同じ中身を開ける
- **マインドマップは「2. アウトライン」の編集でだけ使う**。下書きの横には図を出さない
- **見た目**: 暖色の紙（背景 `#f6f3ec`・カード `#fffdf8`）と深緑の差し色（`#2f6f62`）。英文の本文と見出しは Georgia、画面の文字は system-ui。外部フォントは読まない
- **構成の 4 役割の色**をアプリ全体で通す: Topic sentence = 青 / Reason = 緑 / Example = 橙 / Concluding sentence = 紫（アウトラインのリスト・モデル文・構成の解説で同じ色）

### 履歴

本文などは**最新だけ**を持ち、保存のたびに上書きする。版の履歴は持たない。

## データ保存

`../daily-note` と同じく、**Dropbox 上のファイル**として保存する（2026-11-08 決定）。

- サーバは PC のローカルファイルではなく、Dropbox API でクラウド上のファイルを読み書きする。各端末へは Dropbox 側が同期する
- 実装は daily-note（`/home/ubuntu/daily-note`）の方式を参考にする
  - Dropbox クライアント: `src/dropbox/client.ts`
  - リフレッシュトークンの取得と接続確認: `src/scripts/dropbox-auth.ts` / `src/scripts/dropbox-check.ts`
  - 仕様: daily-note の `CLAUDE.md` の「Dropbox API」「編集競合」の節
- daily-note で決めた次の要点を踏襲する
  - OAuth2 の `token_access_type=offline` でリフレッシュトークンを取り、アクセストークン（約 4 時間で失効）は自動で更新する
  - `list_folder` は件数が少なくても `has_more` が付くことがあるので、必ず `list_folder/continue` で最後まで辿る
  - 保存は `mode=update` に取得時の `rev` を付ける。`rev` が合わなければ上書きせずユーザーに知らせる（`mode=overwrite` は使わない）
  - Dropbox のトークン類は環境変数で渡し、リポジトリに置かない
- Dropbox アプリは **daily-note と共用**する（daily-note の `.env` の App key / App secret / リフレッシュトークンを使う。2026-11-08 決定）
- 保存先は daily-note の隣の専用フォルダ **`/akira/Documents/esl-writing/`**（日誌フォルダ `/akira/Documents/dailynote/` の中には置かない）

### ファイルの配置

パラグラフごとにフォルダを 1 つ作り、段階ごとにファイルを分ける。

```
/akira/Documents/esl-writing/
  paragraphs/
    2026-11-08-school-uniforms/   ← 作成日 + テーマから作るフォルダ名
      assignment.md               ← テーマ・課題の条件
      outline.txt                 ← アウトライン（字下げテキスト。daily-note のマップと同じ形式）
      draft.txt                   ← 下書きの本文
```

- ファイルを分けるのは、段階ごとに別々に自動保存でき、`rev` による競合の判定もファイル単位で済むため。`outline.txt` は daily-note のマップでも開ける
- AI の採点の最新の結果は `feedback.json`（同じフォルダ。形は `src/shared/feedback.ts`。`rev` 付きで書く）
- 学習ガイドの中身（解説・モデル文・表現集）は固定コンテンツなので、Dropbox ではなくリポジトリに置く（`src/shared/guide.ts`。描き方は `src/browser/guide-content.ts` で、学習ガイド画面と右ペインで共用。中身の食い違いは `test/guide.test.ts` で防ぐ）
- **フォルダ名はパラグラフの id**: `作成日-テーマのスラッグ`（英数字以外は `-`、40 文字まで、英字が無ければ `paragraph`、同名は `-2`…）。テーマを後で変えてもフォルダ名は変えない。API から来た id は `YYYY-MM-DD-[a-z0-9-]+` だけ受け付ける（`src/paragraphs/naming.ts`）
- **新規作成はフォルダと、テーマだけを入れた `assignment.md` を作る**（ほかの段階の空のファイルは作らない）。段階のファイルが「無い・0 バイト」なら未着手で、一覧の進み具合はこれで判定する（`list_folder` のメタデータだけで分かる）
- **`assignment.md` の書式**（2026-11-08 決定。`src/shared/assignment.ts`）:
  ```markdown
  # Should students wear school uniforms?

  - 語数: 120-150
  - 文数: 8-10

  ## 条件

  理由を 3 つ挙げ、First / Second / Finally を使う。
  ```
  指定は「下限〜上限（片方だけも可）」: `120-150`・`120-`（以上）・`-150`（以下）・`120`（ちょうど）・空（指定なし）。「約 150 語」は自分で幅に直して入れる。
  手で書き換えて形が崩れても内容は消さない（読み取れなかった行は条件の先頭に回す）
- **自動保存**（`src/shared/autosave.ts`・`src/browser/stage-editor.ts`）: 打ち終わって 3 秒で保存。保存中に打てば終わってからもう一度。
  **競合（409）を 1 度でも見たら自動保存を止め**、手元の内容は残したまま知らせる（「手元の内容をコピー」「読み直す（手元の変更は捨てる）」）。
  編集画面はパラグラフを開いている間 3 つの段階の自動保存を持ち続け、同じパラグラフの中で段階を移るときは読み直さない（離れる段階は待たずに保存する）。
  一覧などほかの画面へ移るときは待たずに保存し、新しい画面は**まだ終わっていない保存を全部待ってから**読み込む（古い rev で編集を始めないため）。タブを閉じるときに未保存があれば確認を出す
- 段階のファイルは、読み込み時に改行コード・BOM・末尾の改行を控え、保存時に戻す（`outline.txt` は daily-note のマップなど他でも開くため。`src/paragraphs/text.ts`）

## 技術スタック

2026-11-08 に決定（経緯は `docs/plans/archive/tech-stack.md`）。**API サーバ + 素の TypeScript の SPA**。

- **サーバ**: Node 22 + TypeScript、`node:http`（フレームワークは使わない）。JSON の API だけを出し、Dropbox の読み書きを受け持つ。束ねたブラウザ用コードと静的ファイルも配る
  - 認証は付けないので、`127.0.0.1`（と `::1`）だけで待ち受ける
  - **開く名前は `http://esl-writing.localhost:3016`**（2026-11-08。project-manager の `project-manager.localhost:8200` にならう）。`*.localhost` はブラウザが自分の PC に向けるので設定は要らない。`127.0.0.1:3016` でも開ける
  - **安全チェック**（`src/server/guard.ts`。project-manager の `guard.ts` と同じ考え方）: Host が `127.0.0.1` / `localhost` / `esl-writing.localhost` のこのポートのときだけ受ける（DNS rebinding 対策）、Origin があれば同じオリジンだけ、書き込みは `X-ESL-Request: 1` と JSON が必須。CSP はインラインのスクリプト・スタイルを許さない
  - API（`src/server/api.ts`）: `GET/POST /api/paragraphs`、`DELETE /api/paragraphs/:id`、`GET/PUT /api/paragraphs/:id/stages/:stage`。保存の競合は 409 `{ error: 'conflict' }`。一覧の各項目には `assignment.md` のテーマ `theme` を足す（`src/paragraphs/themes.ts`。id + rev で覚えておき、変わっていなければ読み直さない）。AI の採点は `GET/POST /api/paragraphs/:id/feedback`、アイデア出しは `POST /api/ai/themes`・`POST /api/ai/ideas`、アウトラインの指摘は `POST /api/ai/outline`（下書きが空 400 `empty_draft`・キーが無い 503 `ai_not_configured`・拒否 422 `ai_refusal`・API の失敗 502 `ai_error`）
  - Dropbox のトークン類は `.env` に置き、`node --env-file-if-exists=.env` で読む（daily-note と同じ）
- **画面**: ブラウザ側の素の TypeScript で描く 1 ページ（一覧・編集・学習ガイドを切り替える）。フレームワークは使わず、esbuild で束ねる
  - 画面の切り替えは URL のハッシュ（`#/` = 一覧、`#/p/<id>/<stage>` = 編集、`#/guide` = 学習ガイド、`#/review` = 振り返り。`src/shared/route.ts`）。サーバが返すページは `/` だけ
  - DOM は `src/browser/dom.ts` の `h()` で組み、本文などのデータは文字列ノードとして入れる（innerHTML は使わない）
  - 段階の切り替えはページ遷移なしで行う。3 つのファイルの `rev` と未保存の状態はブラウザ側で持ち、ファイルごとに自動保存する（`src/browser/views/edit.ts`。画面の入口は `View.navigate()` で作り直さずに済むかを聞く）
  - ヘッダの保存の状態は 3 つをまとめて 1 つ出し（競合 > 保存できません > 保存中 > 未保存 > 保存済み）、段階のタイルに段階ごとの状態の行（`src/shared/stage-summary.ts`）と保存の印を出す
- **daily-note から流用するもの**: `src/editor/outline.ts`・`src/editor/mindmap-layout.ts`（DOM を使わない純関数。ここでは `src/shared/` に置き、テストも移した）、`src/browser/map.ts`（素の TS のマップ。綴りの確認・画像の書き出し・AI に送る範囲の知らせ・タッチ操作は外し、`mountMap()` の部品にした。段階を移るたびに作り直すので `document` のリスナは `destroy()` で外す）、`src/dropbox/client.ts`
- **書き直すもの**: 画面の描画と自動保存（daily-note はサーバで HTML を組む方式なので流用しない）
- **テスト**: `node --test`。DOM を使わない部分（アウトライン・語数／文数の数え方・API の入出力など）を node で直接確かめる
- **lint / 整形**: Biome
- **AI**: `@anthropic-ai/sdk` をサーバ側で使い、API を足して右ペインに結果を描く（`src/ai/`。テストは偽の採点器で、実 API は叩かない）

### コードの置き場所

- `src/config.ts`（環境変数）/ `src/log.ts`（トークンを伏せるログ）/ `src/dropbox/client.ts`（Dropbox API。daily-note から移植）
- `src/ai/`: AI（`scoring.ts` = 採点、`ideas.ts` = アイデア出し・`outline-review.ts` = アウトラインの指摘のプロンプト・出力のスキーマと検証の純関数、`client.ts` = SDK の呼び出し（共通）、`errors.ts`）
- `src/paragraphs/`: 保存層。`store.ts`（一覧・段階のファイルの読み書き・作成・削除。競合は `StageConflictError`）、`naming.ts`、`text.ts`、`themes.ts`（一覧のテーマ）
- `src/server/`: `server.ts`（HTTP サーバ・画面のファイル）、`api.ts`（JSON API）、`guard.ts`（安全チェック・CSP）。起動は `src/main.ts`
- `src/shared/`: サーバとブラウザで共有する型と定数（`types.ts`）、画面の切り替え（`route.ts`）、`assignment.md` の書式（`assignment.ts`）、自動保存（`autosave.ts`）、タイルの状態の行（`stage-summary.ts`）、アウトライン（`outline.ts`・`mindmap-layout.ts`。daily-note から移植）。Node にも DOM にも依存しない
- `src/browser/`: 画面（`main.ts`・`api.ts`・`dom.ts`・`stage-editor.ts`・`guide-pane.ts`（編集画面の右ペイン）・`map.ts`（マインドマップ）・`views/`）。`tsconfig.web.json` で型チェックし、esbuild で `dist/browser/app.js` に束ねる
- `web/`: `index.html`（外枠）と `style.css`（決定版のデザインの色・フォントを CSS 変数に）
- `src/scripts/`: `dropbox-check.ts`・`dropbox-smoke.ts`
- `test/`: `node --test`。Dropbox は偽の `fetch` / 偽のクライアントに差し替え、実 API は叩かない

### 開発コマンド

| コマンド | 内容 |
|---|---|
| `./run-server.sh` | バックグラウンドで起動してシェルに戻る（ビルドが古ければビルドし、ポートを掴んでいる前回のプロセスを止めてから。待ち受けるまで待つ。出力は `logs/server.log`） |
| `./run-server.sh --foreground` | フォアグラウンドで動かす（以前の動き） |
| `./run-server.sh --stop` | 止める |

project-manager の起動コマンド（`projects.yaml` の `app.start`）は `PORT=3016 ./run-server.sh` のまま（2026-11-08 決定。`--foreground` にはしない）。
project-manager はフォアグラウンドで動き続ける前提で回すので、起動するとサーバは動くが、project-manager の画面にはすぐ「サーバが終了しました」と出る（ログは `logs/server.log`）。
| `npm start` | `node dist/main.js`（先に `build` が要る） |
| `npm run build` | `tsc` で `dist/` へ出力 → esbuild で `src/browser/` を `dist/browser/app.js` に束ねる |
| `npm test` | `tsc -p tsconfig.test.json` → `node --test`（`dist-test/`） |
| `npm run typecheck` | 型チェックのみ（`src`・`test`、ブラウザ向けは `tsconfig.web.json`） |
| `npm run lint` / `npm run lint:fix` | Biome |
| `npm run dropbox:check` | Dropbox に繋がるか確かめる（**読むだけ**。パラグラフの件数と着手済みの件数だけ出す） |
| `npm run dropbox:smoke` | 本物の Dropbox で保存層を一通り動かす（**書く**。`<保存先>/.smoke-test/` だけを使い、最後に消す） |

環境変数は `.env.example` を参照。`.env` はコミットしない。Dropbox の 3 つの値は daily-note の `.env` から写す（リフレッシュトークンを取り直すときは daily-note の `npm run dropbox:auth`）。AI の採点には `ANTHROPIC_API_KEY`。

## 開発管理画面

タスク・プラン・ファイルの閲覧と編集、Claude Code への依頼は project-manager（`http://127.0.0.1:8200`、`~/project-manager`）で行う。

## タスク管理ルール

- タスクは `TODO.md` で管理する
- タスクが完了したら `TODO.md` から該当項目を削除し、`DONE.md` に移動する
- `DONE.md` には完了日を `YYYY-MM-DD` 形式で付けて記録する
- 新しいタスクが発生したら `TODO.md` の適切なセクションに追加する
- タスクの実施前に `TODO.md` を確認し、優先度の高いものから着手する
- コミット時に `TODO.md` を確認し、実装した機能に対応するタスクがあれば `DONE.md` に移動する

## 作業着手ルール

作業（実装・調査いずれも）を始めるときは、コードに手を入れる前に以下を行う。

1. **プランファイルを作成する**: `docs/plans/<task-name>.md` に実装プラン or 調査プランを作成する
   - 目的・背景、対応方針、影響範囲、テスト方針を最低限記載する
   - 複数 Phase / Step に分かれる場合はファイル内でも Phase / Step を明示する
2. **`TODO.md` に該当項目があるか確認する**
   - 無ければ適切なセクションに追加する
   - 既存項目があれば、その項目に作成したプランファイルへのリンクを追記する（例: `[plan](docs/plans/<task-name>.md)`）
3. **複数 Phase / Step がある場合は `TODO.md` に子タスクとして追加する**
   - 親項目の下にインデントしたチェックボックスで Phase / Step を列挙する
   - Phase / Step が完了するごとにチェックを入れ、全完了で親項目を `DONE.md` に移す
4. **作業完了時の後片付け**
   - 親タスクを `DONE.md` に移動する
   - 対応するプランファイルは `docs/plans/archive/` に移動する
