import { countSentences, countWords, hasJapanese } from '../shared/counting.js'
import { exportFileName, plainTextOf } from '../shared/export.js'
import { h, replace } from './dom.js'

/**
 * 下書きの書き出しのダイアログ（`docs/plans/archive/export-plain-text.md`）。
 * 書き出す本文を確かめてから「テキストをコピー」か「.txt で保存」。本文はブラウザの中で出すだけで、サーバへは送らない。
 */

export interface ExportOptions {
  id: string
  /** 手元の最新の下書き（まだ保存していない分も含む）。 */
  text: string
}

export function openExportDialog(app: HTMLElement, options: ExportOptions): void {
  const text = plainTextOf(options.text)
  const empty = text === ''
  const done = h('span', { class: 'muted export-done' })
  const notes = [
    empty ? '下書きがまだ空です。' : null,
    !empty && hasJapanese(text) ? '日本語が混じっています。下書きは英語だけで書きます。' : null,
  ].filter((note) => note !== null)

  const copy = h('button', { class: 'btn', type: 'button', disabled: empty }, 'テキストをコピー')
  const save = h('button', { class: 'btn pri', type: 'button', disabled: empty }, '.txt で保存')
  const close = h('button', { class: 'btn', type: 'button' }, '閉じる')

  const dialog = h(
    'dialog',
    { class: 'export-dialog' },
    h(
      'div',
      { class: 'export-body' },
      h('h2', {}, '書き出し'),
      h(
        'p',
        { class: 'muted export-meta' },
        empty
          ? ''
          : `${countWords(text)} 語 ・ ${countSentences(text)} 文 ・ ${exportFileName(options.id)}`,
      ),
      ...notes.map((note) => h('p', { class: 'error' }, note)),
      empty ? null : h('pre', { class: 'export-preview', lang: 'en' }, text),
      h('div', { class: 'actions' }, done, close, copy, save),
    ),
  )

  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(
      () => replace(done, 'コピーしました'),
      () => replace(done, 'コピーできません'),
    )
  })
  save.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = h('a', { href: url, download: exportFileName(options.id) })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    replace(done, '保存しました')
  })
  close.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => dialog.remove())

  app.append(dialog)
  dialog.showModal()
  ;(empty ? close : save).focus()
}
