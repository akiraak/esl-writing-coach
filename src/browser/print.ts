import type { SubmissionDocument } from '../shared/document.js'
import { h } from './dom.js'

/**
 * 提出用の文書を印刷する（「PDF に保存」で PDF にする。`docs/plans/archive/docx-pdf-export.md`）。
 *
 * 印刷用の 1 枚（`#print-sheet`）を描いて `window.print()`。印刷の CSS（`web/style.css` の `@media print`）でアプリの画面を隠す。
 * 保存のファイル名の既定がパラグラフの id になるよう、印刷の間だけ `document.title` を変える。
 */
export function printDocument(doc: SubmissionDocument, fileTitle: string): void {
  document.getElementById('print-sheet')?.remove()
  const sheet = h(
    'div',
    { id: 'print-sheet', lang: 'en' },
    ...doc.header.map((line) => h('p', { class: 'ps-head' }, line)),
    doc.title === '' ? null : h('p', { class: 'ps-title' }, doc.title),
    ...doc.paragraphs.map((p) => h('p', { class: 'ps-body' }, p)),
  )
  document.body.append(sheet)
  const title = document.title
  document.title = fileTitle
  const done = () => {
    sheet.remove()
    document.title = title
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
