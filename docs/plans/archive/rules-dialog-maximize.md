# AIルールダイアログをできるだけ大きくする

## 目的・背景

AIルールのダイアログは幅 `min(640px, 100vw - 48px)`・textarea 高さ 200px の固定サイズ。
長いルールを書きやすいよう、ダイアログを画面いっぱい（余白 24px 程度）に広げ、textarea が残り全高を使うようにする。

## 対応方針

- `style.css` のみ変更
  - `.rules-dialog` を `width/height: calc(100vw/vh - 48px)`、ブラウザ既定の `max-width/max-height`（ビューポート依存の制限）は `none` に上書き
  - 開いているとき（`.rules-dialog[open]`）だけ `display: flex; flex-direction: column`（無条件に display を上書きすると閉じた状態でも表示されてしまうため `[open]` 限定）
  - textarea は `flex: 1` で残り全高を占有。`resize` は不要になるので none

## 影響範囲

- style.css のみ。HTML / JS / バックエンド変更なし

## テスト方針

- ヘッドレス Chromium でダイアログの実サイズがビューポート − 余白とほぼ一致すること、閉じた状態で非表示のことを確認し、スクリーンショットで見た目確認
