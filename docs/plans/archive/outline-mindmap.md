# アウトライン: daily-note のマインドマップを移植

## 目的・背景

編集画面の STEP 3（アウトライン）を作る。daily-note のマップ機能を移植し、opinion paragraph の骨組みをマインドマップで作る
（中心 = 意見（topic sentence の元）、子 = 理由、孫 = 例・詳細、最後に結論。`CLAUDE.md` の「書く流れ」）。

**正は字下げのテキスト**（`outline.txt`）で、図はその見え方。座標・畳みは保存しない。`outline.txt` は daily-note のマップでもそのまま開ける。

移植元（daily-note `1b79b04`）:

| 移植元 | 移植先 | 扱い |
|---|---|---|
| `src/editor/outline.ts`（471 行） | `src/shared/outline.ts` | そのまま（DOM を使わない純関数。説明の参照先だけ直す） |
| `src/editor/mindmap-layout.ts`（179 行） | `src/shared/mindmap-layout.ts` | そのまま |
| `test/outline.test.ts`・`test/mindmap-layout.test.ts` | `test/` | import の先だけ直す |
| `src/browser/map.ts`（1153 行） | `src/browser/map.ts` | 下のとおり削って、この画面の部品にする |

`src/shared/` に置くのは、node のテストで確かめるため（daily-note の `src/editor/` と同じ役目。Node にも DOM にも依存しない）。

## 対応方針

### Phase 1: 純関数とテストを移す

- `outline.ts`・`mindmap-layout.ts` とそのテストを移し、`npm test` を通す

### Phase 2: マップの部品（`src/browser/map.ts`）

- daily-note の `mount(binding, title)` を `mountMap(host, { text, title, centerPlaceholder, onChange })` に変える。
  daily-note は隠した textarea に書き戻していたが、ここでは `onChange(text)` で段階の自動保存（`StageEditor.update`）へ渡す
- **外すもの**（`CLAUDE.md` の「技術スタック」と「前提」）
  - 英単語の綴りの確認（`note-spell` / `note-replace`・波線）
  - 画像（PNG）の書き出し
  - AI に送る範囲の知らせ（`note-selection`・`subtreeRange` の呼び出し。関数は `outline.ts` に残す）
  - タッチ操作（長押しのドラッグ・2 本指の拡大縮小・タップで名前）。PC 専用なので
- **残すもの**: キー操作（Tab 子 / Enter 兄弟 / Space・F2・ダブルクリック 名前 / Delete 消す / Alt+矢印 付け替え / Ctrl+↑↓ 畳む / Ctrl+Z 元に戻す）、
  マウスのドラッグで付け替え・何もない所のドラッグで図を動かす・Ctrl+ホイールで拡大縮小、枝のコピー・カット・貼り付け、操作のボタンの帯
- 段階を移ると部品を作り直すので、`document` に付けたリスナ（コピー・貼り付け）と `ResizeObserver` は `destroy()` で外す
- 色は決定版のデザインの CSS 変数に置き換える（中心は深緑の差し色）

### Phase 3: アウトラインの画面

- 中央のペインの高さいっぱいにマップを出す。上に型の早見（中心 = 意見 / 子 = 理由 / 孫 = 例・詳細 / 最後に結論）を 1 行
- 仮の中心（字下げ 0 の行が無い・2 つ以上）の名前は課題のテーマ（空なら「意見」）
- 本文が空なら、すぐ中心の名前を打てる（入力欄の例: 「意見（topic sentence の元）」）
- 打つたびに `editor.update(text)`。タイルの「N 項目」は骨組みで対応済み
- 構成の役割の色（青・緑・橙・紫）はマップには付けない。深さ → 役割の規則（とくに結論の見分け方）は下書きのタスクで決めるので、それまでは決めつけない

## 影響範囲

- 新規: `src/shared/outline.ts`・`src/shared/mindmap-layout.ts`・`src/browser/map.ts`・`src/browser/views/outline.ts`・テスト 2 つ
- `src/browser/views/edit.ts`（段階ごとの描き分け）・`web/style.css`・`CLAUDE.md`（移植した場所）

## テスト方針

- 移したテスト（outline / mindmap-layout）がそのまま通ること
- 画面は 3017 番で立て、ヘッドレスブラウザで確かめる（試し用のパラグラフを作り、最後に消す）
  - 空から中心の名前 → Tab で子 → Enter で兄弟、と打って `outline.txt` が字下げのテキストで保存される
  - Alt+→ で 1 段深く・Delete で消す・Ctrl+Z で戻る
  - 段階を移って戻る・再読み込みしても図が同じ
  - 段階を何度も移ってもリスナが重ならない（コピーが 1 回だけ）
