import type { Assignment, CountRange } from '../../shared/assignment.js'
import { countSentences, countWords, hasJapanese } from '../../shared/counting.js'
import { phraseToInsert } from '../../shared/insert.js'
import { meterOf } from '../../shared/meter.js'
import { outlineRoles } from '../../shared/outline-roles.js'
import { routeHash } from '../../shared/route.js'
import { h, replace } from '../dom.js'
import { setPhraseTarget } from '../phrase-target.js'
import { roleNodes } from '../role-list.js'
import type { StageEditor } from '../stage-editor.js'
import { assignmentBrief } from './brief.js'

/**
 * STEP 3 下書き・推敲（`draft.txt`。英語のみ）。モックの編集画面（`decided.html`）。
 *
 * - 上: 語数・文数のメーター（課題の指定の幅を帯で示す）と課題の帯。日本語が混じっていれば注意
 * - 下: 本文の欄と、右にアウトラインを構成の役割の色で並べたリスト（見るだけ。役割は `outline-roles.ts`）
 */

export interface DraftViewOptions {
  id: string
  editor: StageEditor
  assignment: Assignment
  /** 手元の最新のアウトライン（字下げのテキスト）。 */
  outline: string
}

function meterBox(unit: string, range: CountRange) {
  const count = h('b')
  const need = h('span', { class: 'need' })
  const fill = h('div', { class: 'fill' })
  const band = h('div', { class: 'band' })
  const bar = h('div', { class: 'bar' }, band, fill)
  const box = h(
    'div',
    { class: 'meter' },
    h('div', { class: 'lab' }, h('span', {}, count, unit), need),
    bar,
  )
  // 目盛り（指定の下限・上限）は指定が変わらないので最初に置く
  const first = meterOf(0, range, unit)
  for (const tick of first.ticks) {
    const el = h('span', { class: 'tick' }, String(tick.value))
    bar.append(el)
  }
  return {
    box,
    update(n: number) {
      const meter = meterOf(n, range, unit)
      replace(count, String(n))
      replace(need, meter.message)
      need.className = `need ${meter.status}`
      bar.hidden = meter.band === null
      fill.className = `fill ${meter.status}`
      fill.style.width = `${meter.fill}%`
      if (meter.band !== null) {
        band.style.left = `${meter.band.from}%`
        band.style.width = `${meter.band.to - meter.band.from}%`
      }
      // 目盛りは数が最大を超えると位置が動く
      const ticks = bar.querySelectorAll<HTMLElement>('.tick')
      meter.ticks.forEach((tick, i) => {
        const el = ticks[i]
        if (el !== undefined) el.style.left = `${tick.at}%`
      })
    },
  }
}

function outlineList(id: string, outline: string): HTMLElement {
  const items = outlineRoles(outline)
  const body =
    items.length === 0
      ? [
          h('p', { class: 'muted' }, 'アウトラインはまだありません。'),
          h('a', { href: routeHash({ name: 'edit', id, stage: 'outline' }) }, 'STEP 2 で作る'),
        ]
      : roleNodes(items)
  return h(
    'aside',
    { class: 'struct', 'aria-label': 'アウトライン（見るだけ）' },
    h('h4', {}, 'アウトライン', h('span', {}, '見るだけ')),
    ...body,
  )
}

/** 本文の欄のカーソルの位置に表現を入れる（選んでいる文字があれば置き換え）。元に戻せるよう insertText で入れる。 */
function insertAtCursor(paper: HTMLTextAreaElement, phrase: string): void {
  const { selectionStart: start, selectionEnd: end, value } = paper
  const text = phraseToInsert(value, start, end, phrase)
  paper.focus()
  // execCommand は古い API だが、ブラウザの「元に戻す」に乗る唯一の方法。使えなければ setRangeText
  const done = document.execCommand('insertText', false, text)
  if (!done) {
    paper.setRangeText(text, start, end, 'end')
    paper.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

/** 描いて、片付けの関数を返す（表現集から入れる先の登録を外す）。 */
export function renderDraftView(container: HTMLElement, options: DraftViewOptions): () => void {
  const { assignment } = options
  const words = meterBox('語', assignment.words)
  const sentences = meterBox('文', assignment.sentences)
  const warn = h('p', { class: 'draft-warn' })

  const refresh = (text: string) => {
    words.update(countWords(text))
    sentences.update(countSentences(text))
    replace(warn, hasJapanese(text) ? '日本語が混じっています。下書きは英語だけで書きます。' : '')
  }

  const paper = h('textarea', {
    class: 'paper',
    lang: 'en',
    placeholder: 'In my opinion, …',
    'aria-label': '下書きの本文（英語）',
    oninput: () => {
      refresh(paper.value)
      options.editor.update(paper.value)
    },
  })
  paper.value = options.editor.text
  refresh(paper.value)
  // 右ペインの表現集から、カーソルの位置に入れられるようにする
  const unregister = setPhraseTarget((phrase) => insertAtCursor(paper, phrase))

  replace(
    container,
    h(
      'div',
      { class: 'draft' },
      h('div', { class: 'meters' }, words.box, sentences.box),
      warn,
      assignmentBrief(options.id, assignment),
      h('div', { class: 'work' }, paper, outlineList(options.id, options.outline)),
    ),
  )
  return unregister
}
