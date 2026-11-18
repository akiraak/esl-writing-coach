import { countSentences, countWords, hasJapanese } from '../shared/counting.js'
import { documentOf, formatSubmissionDate } from '../shared/document.js'
import { buildDocx, DOCX_MIME, docxFileName } from '../shared/docx.js'
import { exportFileName, plainTextOf, titleLine } from '../shared/export.js'
import { h, replace } from './dom.js'
import { t } from './i18n.js'
import { printDocument } from './print.js'

/**
 * 下書きの書き出しのダイアログ（`docs/plans/archive/export-plain-text.md`・`docx-pdf-export.md`）。
 *
 * - 書き出す本文を確かめてから、提出用のファイル（.docx・PDF）かプレーンテキスト（コピー・.txt）
 * - タイトル（STEP 3 のタイトルの欄）は提出用のファイルの中央のタイトルと、プレーンテキストの 1 行目に入れる。
 *   課題のテーマは出さない（`docs/plans/archive/draft-title.md`）
 * - 提出用のファイルは名前・クラス・日付（任意）を左上に入れる。名前とクラスはこのブラウザに覚えておく（消えても困らない便利のため）
 * - 本文はブラウザの中で出すだけで、サーバへは送らない
 */

export interface ExportOptions {
  id: string
  /** 手元の最新のタイトル（STEP 3 のタイトルの欄。空でもよい）。 */
  title: string
  /** 手元の最新の下書き（まだ保存していない分も含む）。 */
  text: string
}

const STORAGE_KEY = 'esl-writing.submission'

function loadRemembered(): { name: string; klass: string } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    return {
      name: typeof value['name'] === 'string' ? value['name'] : '',
      klass: typeof value['klass'] === 'string' ? value['klass'] : '',
    }
  } catch {
    return { name: '', klass: '' }
  }
}

function remember(name: string, klass: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, klass }))
  } catch {
    // 覚えられなくても書き出しはできる
  }
}

function download(bytes: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = h('a', { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function openExportDialog(app: HTMLElement, options: ExportOptions): void {
  const text = plainTextOf(options.text, options.title)
  /** 本文だけ（語数・文数はタイトルを数えない）。 */
  const body = plainTextOf(options.text)
  const empty = text === ''
  const noTitle = titleLine(options.title) === ''
  const done = h('span', { class: 'muted export-done' })
  const m = t().exportDialog
  const notes = [
    empty ? m.empty : null,
    !empty && hasJapanese(text) ? m.japanese : null,
    !empty && noTitle ? m.noTitle : null,
  ].filter((note) => note !== null)

  const remembered = loadRemembered()
  const field = (label: string, value: string, placeholder: string) => {
    const input = h('input', { type: 'text', value, placeholder, 'aria-label': label })
    return { input, el: h('label', { class: 'sub-field' }, h('span', {}, label), input) }
  }
  const name = field(m.name, remembered.name, 'Akira Kozakai')
  const klass = field(m.klass, remembered.klass, 'ESL Writing 101')
  const date = field(m.date, formatSubmissionDate(new Date()), 'November 8, 2026')

  const submission = () => {
    remember(name.input.value.trim(), klass.input.value.trim())
    return documentOf({
      title: options.title,
      draft: options.text,
      name: name.input.value,
      klass: klass.input.value,
      date: date.input.value,
    })
  }

  const docx = h('button', { class: 'btn pri', type: 'button', disabled: empty }, m.docx)
  const pdf = h('button', { class: 'btn pri', type: 'button', disabled: empty }, m.pdf)
  const copy = h('button', { class: 'btn', type: 'button', disabled: empty }, m.copy)
  const txt = h('button', { class: 'btn', type: 'button', disabled: empty }, m.txt)
  const close = h('button', { class: 'btn', type: 'button' }, m.close)

  const dialog = h(
    'dialog',
    { class: 'export-dialog' },
    h(
      'div',
      { class: 'export-body' },
      h('h2', {}, m.title),
      h(
        'p',
        { class: 'muted export-meta' },
        empty ? '' : m.meta(countWords(body), countSentences(body)),
      ),
      ...notes.map((note) => h('p', { class: 'error' }, note)),
      empty ? null : h('pre', { class: 'export-preview', lang: 'en' }, text),
      h(
        'section',
        { class: 'export-section' },
        h('h3', {}, m.submission),
        h('p', { class: 'muted export-hint' }, m.submissionHint),
        h('div', { class: 'sub-fields' }, name.el, klass.el, date.el),
        h('div', { class: 'export-buttons' }, docx, pdf),
      ),
      h(
        'section',
        { class: 'export-section' },
        h('h3', {}, m.plain),
        h('p', { class: 'muted export-hint' }, m.plainHint),
        h('div', { class: 'export-buttons' }, copy, txt),
      ),
      h('div', { class: 'actions' }, done, close),
    ),
  )

  docx.addEventListener('click', () => {
    download(buildDocx(submission()), DOCX_MIME, docxFileName(options.id))
    replace(done, m.saved(docxFileName(options.id)))
  })
  pdf.addEventListener('click', () => {
    printDocument(submission(), options.id)
  })
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(
      () => replace(done, m.copied),
      () => replace(done, m.copyFailed),
    )
  })
  txt.addEventListener('click', () => {
    download(text, 'text/plain;charset=utf-8', exportFileName(options.id))
    replace(done, m.saved(exportFileName(options.id)))
  })
  close.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => dialog.remove())

  app.append(dialog)
  dialog.showModal()
  ;(empty ? close : docx).focus()
}
