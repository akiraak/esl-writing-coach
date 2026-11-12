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
 * - 下: 本文の欄と、右にアウトラインを構成の役割の色で並べたリスト（見るだけ。役割は `outline-roles.ts`）と「書き出し →」
 * - アウトラインのリストは「閉じる ›」で右に閉じて細い帯にでき、本文の欄がその分広がる（開閉はブラウザに覚える。
 *   `docs/plans/archive/draft-outline-toggle.md`）。閉じている間、右の列の「書き出し →」は出さない（ヘッダの「書き出し」がある）
 * - 本文の欄は画面の下いっぱいまで使い、紙のノートのような横罫を背景に敷く（`docs/plans/archive/draft-paper.md`）
 */

export interface DraftViewOptions {
  id: string
  editor: StageEditor
  assignment: Assignment
  /** 手元の最新のアウトライン（字下げのテキスト）。 */
  outline: string
  /** 「書き出し →」（右の列のアウトラインのリストの下に置く。本文の欄を画面の下いっぱいに使うため）。 */
  exportButton(): HTMLElement
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

const OUTLINE_KEY = 'esl-writing.draft-outline'

/** アウトラインのリストを閉じているか（覚えていなければ開いている）。 */
function loadOutlineClosed(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) === 'closed'
  } catch {
    return false
  }
}

function saveOutlineClosed(closed: boolean): void {
  try {
    if (closed) localStorage.setItem(OUTLINE_KEY, 'closed')
    else localStorage.removeItem(OUTLINE_KEY)
  } catch {
    // 覚えられなくても開閉はできる
  }
}

function outlineList(id: string, outline: string, close: HTMLElement): HTMLElement {
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
    h('h4', {}, 'アウトライン', h('span', {}, '見るだけ'), close),
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

/**
 * 罫線をスクロールに追従させる（Firefox 向け。daily-note の `followRules` と同じ）。Firefox は textarea の背景に
 * `background-attachment: local` を効かせないので、CSS（`@supports` で Firefox だけ）がこの 2 つで背景を動かす。
 * ほかのブラウザでは CSS が使わないので、値を置くだけで見た目は変わらない。片付けの関数を返す。
 */
function followRules(paper: HTMLTextAreaElement): () => void {
  const update = () => {
    const style = getComputedStyle(paper)
    const top = Number.parseFloat(style.paddingTop) || 0
    const row = Number.parseFloat(style.lineHeight) || 0
    paper.style.setProperty('--rule-scroll', String(paper.scrollTop))
    // 模様の高さ = 本文の頭から下の余白の下端まで + 1 行（端は clip に切らせる）
    paper.style.setProperty('--rule-h', `${paper.scrollHeight - top + row}px`)
  }
  paper.addEventListener('scroll', update)
  paper.addEventListener('input', update)
  const observer = new ResizeObserver(update)
  observer.observe(paper)
  return () => {
    paper.removeEventListener('scroll', update)
    paper.removeEventListener('input', update)
    observer.disconnect()
  }
}

/** 描いて、片付けの関数を返す（表現集から入れる先の登録と、罫線の追従を外す）。 */
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

  /** アウトラインのリストを右に閉じる・開く（閉じると本文の欄が広がる）。 */
  const setClosed = (closed: boolean, focus: boolean) => {
    work.classList.toggle('side-closed', closed)
    saveOutlineClosed(closed)
    if (focus) (closed ? openButton : closeButton).focus()
  }
  const closeButton = h(
    'button',
    {
      class: 'struct-toggle',
      type: 'button',
      title: 'アウトラインを右に閉じて、本文の欄を広げる',
      onclick: () => setClosed(true, true),
    },
    '閉じる ›',
  )
  const openButton = h(
    'button',
    {
      class: 'struct-open',
      type: 'button',
      title: 'アウトラインを開く',
      onclick: () => setClosed(false, true),
    },
    '‹ アウトライン',
  )
  const work = h(
    'div',
    { class: 'work' },
    paper,
    h(
      'div',
      { class: 'work-side' },
      openButton,
      outlineList(options.id, options.outline, closeButton),
      options.exportButton(),
    ),
  )
  setClosed(loadOutlineClosed(), false)

  replace(
    container,
    h(
      'div',
      { class: 'draft' },
      h('div', { class: 'meters' }, words.box, sentences.box),
      warn,
      assignmentBrief(options.id, assignment),
      work,
    ),
  )
  const stopRules = followRules(paper)
  return () => {
    unregister()
    stopRules()
  }
}
