import {
  type Assignment,
  type CountRange,
  isReversed,
  parseAssignment,
  serializeAssignment,
} from '../../shared/assignment.js'
import { h, replace } from '../dom.js'
import type { StageEditor } from '../stage-editor.js'

/**
 * STEP 1 課題: テーマ・語数／文数の指定・構成や表現の条件（書式は `src/shared/assignment.ts`）。
 * 打つたびに本文を組み直して自動保存に渡す。
 */

export interface AssignmentViewOptions {
  text: string
  editor: StageEditor
  /** テーマが変わったら（ヘッダのパンくずを書き換える）。 */
  onThemeChange(theme: string): void
}

function numberValue(input: HTMLInputElement): number | null {
  const value = input.value.trim()
  if (value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

function rangeInputs(label: string, unit: string, initial: CountRange, onInput: () => void) {
  const attrs = (value: number | null, aria: string) => ({
    type: 'number',
    min: 0,
    step: 1,
    inputmode: 'numeric',
    value: value === null ? '' : String(value),
    'aria-label': aria,
    oninput: onInput,
  })
  const min = h('input', attrs(initial.min, `${label}の下限`))
  const max = h('input', attrs(initial.max, `${label}の上限`))
  const warn = h('span', { class: 'warn' })
  const row = h(
    'div',
    { class: 'range-row' },
    h('span', { class: 'range-label' }, label),
    min,
    h('span', { class: 'tilde' }, '〜'),
    max,
    h('span', { class: 'unit' }, unit),
    warn,
  )
  return {
    row,
    read(): CountRange {
      return { min: numberValue(min), max: numberValue(max) }
    },
    showWarning(range: CountRange) {
      replace(warn, isReversed(range) ? '下限が上限より大きくなっています' : '')
    },
  }
}

export function renderAssignmentView(container: HTMLElement, options: AssignmentViewOptions): void {
  const initial = parseAssignment(options.text)

  const onInput = () => {
    const value: Assignment = {
      theme: theme.value,
      words: words.read(),
      sentences: sentences.read(),
      conditions: conditions.value,
    }
    words.showWarning(value.words)
    sentences.showWarning(value.sentences)
    options.onThemeChange(value.theme.trim())
    options.editor.update(serializeAssignment(value))
  }

  const theme = h('input', {
    class: 'theme-input',
    type: 'text',
    value: initial.theme,
    placeholder: 'Should students wear school uniforms?',
    'aria-label': 'テーマ',
    oninput: onInput,
  })
  const words = rangeInputs('語数', '語', initial.words, onInput)
  const sentences = rangeInputs('文数', '文', initial.sentences, onInput)
  const conditions = h('textarea', {
    class: 'conditions-input',
    rows: 8,
    placeholder:
      '例: 理由を 3 つ挙げ、First / Second / Finally を使う。結論で topic sentence を言い換える。',
    'aria-label': '構成や表現の条件',
    oninput: onInput,
  })
  conditions.value = initial.conditions
  words.showWarning(initial.words)
  sentences.showWarning(initial.sentences)

  replace(
    container,
    h(
      'form',
      { class: 'assignment', onsubmit: (event: Event) => event.preventDefault() },
      h(
        'section',
        { class: 'field' },
        h('label', { class: 'field-label' }, 'テーマ'),
        theme,
        h('p', { class: 'hint' }, '自分で決めたテーマ（問い）。英語でも日本語でもよい。'),
      ),
      h(
        'section',
        { class: 'field' },
        h('label', { class: 'field-label' }, '語数・文数の指定'),
        words.row,
        sentences.row,
        h(
          'p',
          { class: 'hint' },
          '下限〜上限。片方だけでもよい。「約 150 語」のような指定は 140〜160 のように幅に直して入れる。',
        ),
      ),
      h(
        'section',
        { class: 'field' },
        h('label', { class: 'field-label' }, '構成や表現の条件'),
        conditions,
        h(
          'p',
          { class: 'hint' },
          '授業で出された条件をそのまま書く（日本語でよい）。下書きの画面の上に出る。',
        ),
      ),
    ),
  )
}
