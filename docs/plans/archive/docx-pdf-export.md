# .docx / PDF の書き出しと体裁

## 目的・背景

授業の課題はファイルで出す（`docs/plans/archive/app-features.md`: 「提出: ファイルで提出。`.docx` と PDF の両方を書き出せるようにする」）。
MVP ではプレーンテキストだけを作った。2026-11-08、次の作業として Claude が選んだ（提出に直接要る）。

## この作業で決めること（指定が無いので一般的な体裁で進め、見直せるようにする）

- **体裁**（英語の課題の提出でよく使う形。MLA に近い）
  - 用紙 A4・余白 1 インチ・Times New Roman 12pt・行間 2 行（double spacing）
  - 左上に「名前」「クラス」「日付」を 1 行ずつ（入れたものだけ）
  - その下にテーマを中央揃えのタイトルとして
  - 本文は段落の頭を 0.5 インチ下げる。空行で区切った塊を 1 段落とし、段落の中の改行は空白に直す
- **名前・クラス・日付**: 書き出しのダイアログで入れる（任意）。日付の既定は今日（`November 8, 2026` の形）。名前とクラスはこのブラウザに覚えておく（`localStorage`。消えても困らない便利のため）
- **.docx**: ブラウザの中で作ってダウンロードする（本文をサーバや外へ送らない）。ライブラリは使わず、最小の OOXML（`[Content_Types].xml`・`_rels/.rels`・`word/document.xml`・`word/styles.xml`）を無圧縮の ZIP に詰める（`src/shared/docx.ts`。純関数で node でテストする）
- **PDF**: ブラウザの印刷（「PDF に保存」）を使う。印刷用の 1 枚を描いて `window.print()`。印刷の CSS でアプリの画面を隠す。ファイル名の既定がパラグラフの id になるよう、印刷の間だけ `document.title` を変える
- 書き出す本文は、プレーンテキストと同じく手元の最新（未保存の分も含む）

## 対応方針

### Phase 1: 文書の形と .docx（純関数）
- `src/shared/document.ts`: テーマ・下書き・名前・クラス・日付 → 文書の形（頭の行・タイトル・段落）。日付の書式
- `src/shared/docx.ts`: 文書の形 → .docx のバイト列（XML のエスケープ・CRC32・無圧縮 ZIP）

### Phase 2: 画面
- 書き出しのダイアログに「名前・クラス・日付」の欄と「.docx で保存」「PDF（印刷）」を足す
- 印刷用の 1 枚と印刷の CSS（`src/browser/print.ts`・`web/style.css`）

## 影響範囲

- 新規: `src/shared/document.ts`・`src/shared/docx.ts`・`src/browser/print.ts`・テスト
- `src/browser/export-dialog.ts`・`src/browser/views/edit.ts`・`web/style.css`・`CLAUDE.md`

## テスト方針

- `test/document.test.ts`・`test/docx.test.ts`: 段落の分け方・入れたものだけの頭の行・日付の書式・XML のエスケープ・ZIP の形（自前の読み戻しで中身と CRC を確かめる）
- 作った .docx を pandoc で読み戻して、タイトル・頭の行・本文が入っていることを確かめる
- 画面は 3017 番でヘッドレスブラウザ: ダウンロードされる .docx の名前と中身・印刷用の 1 枚の中身と、印刷の CSS でアプリが隠れること（`emulateMedia('print')` で PDF にして目で見る）
