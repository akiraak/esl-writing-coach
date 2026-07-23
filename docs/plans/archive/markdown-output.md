# 添削済み英文・アドバイスの Markdown 表示

## 目的・背景

AI の出力（添削済み英文・アドバイス）は Markdown 記法（箇条書き・強調など）を含むことがあるが、
現在は `textContent` + `white-space: pre-wrap` の素テキスト表示のため `**` や `-` がそのまま見えて読みにくい。
Markdown として整形表示し、コピペしたときは表示されているテキストだけが取れる（記法の記号が混ざらない）ようにする。

## 対応方針

- **レンダラ**: [marked](https://github.com/markedjs/marked) の UMD ミニファイ版を `public/js/vendor/` に vendor する
  （ビルドなし方針のため CDN ではなくローカル配置。npm でインストールして dist をコピー）
- **サニタイズ**: [DOMPurify](https://github.com/cure53/DOMPurify) も同様に vendor し、
  `innerHTML` 挿入前に通す（自分専用ツールだが LLM 出力を HTML 挿入するため念のため）
- **app.js**: `correctedEl.textContent = ...` / `adviceEl.textContent = ...` を
  `renderMarkdown(el, text)` に置き換える。`marked.parse(text, { breaks: true })` → DOMPurify → `innerHTML`。
  改行は `breaks: true` で `<br>` にし、プレーンテキスト出力でも見た目が崩れないようにする
- **語数カウント**: 添削済み英文の語数は Markdown 記号を除いた表示テキスト
  （レンダリング後の `textContent`）で数える
- **CSS**: `.pane .output` の `white-space: pre-wrap` を外し、Markdown 要素
  （h1-h4・p・ul/ol・li・code・pre・blockquote・strong・hr・table）向けの余白・装飾を追加

## コピペ挙動

レンダリング済み HTML を選択してコピーすると、プレーンテキスト貼り付けでは表示テキストのみになる
（`**` などの記法は含まれない）。これで「コピペは表示テキストのみ」を満たす。

## 影響範囲

- `backend/public/js/app.js`（表示処理 2 箇所 + 語数カウント）
- `backend/public/index.html`（vendor スクリプト読み込み）
- `backend/public/css/style.css`（.output の Markdown スタイル）
- `backend/public/js/vendor/`（新規: marked.min.js, purify.min.js）

サーバー側・DB・API は変更なし（保存データは従来どおり Markdown ソースのまま）。

## テスト方針

- サーバーを起動し、ヘッドレス Chromium で記事を開いて以下を確認する
  - 箇条書き・強調を含むテキストが `<ul>/<li>/<strong>` としてレンダリングされる
  - `<script>` などの生 HTML がサニタイズされて実行されない
  - 出力欄の `textContent`（= コピペされるテキスト）に `**` や `- ` の記法が残らない
  - スクリーンショットで見た目を確認
