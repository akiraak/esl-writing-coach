import {
  type Assignment,
  type CountRange,
  isReversed,
  parseAssignment,
  serializeAssignment,
} from '../../shared/assignment.js'
import type { CountKind } from '../../shared/i18n/ja.js'
import { h, replace } from '../dom.js'
import { t } from '../i18n.js'
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

function rangeInputs(kind: CountKind, initial: CountRange, onInput: () => void) {
  const label = t().counts.label[kind]
  const unit = t().counts.unit(2, kind)
  const attrs = (value: number | null, aria: string) => ({
    type: 'number',
    min: 0,
    step: 1,
    inputmode: 'numeric',
    value: value === null ? '' : String(value),
    'aria-label': aria,
    oninput: onInput,
  })
  const min = h('input', attrs(initial.min, t().assignment.min(label)))
  const max = h('input', attrs(initial.max, t().assignment.max(label)))
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
      replace(warn, isReversed(range) ? t().assignment.reversed : '')
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
    'aria-label': t().assignment.theme,
    oninput: onInput,
  })
  const words = rangeInputs('words', initial.words, onInput)
  const sentences = rangeInputs('sentences', initial.sentences, onInput)
  const conditions = h('textarea', {
    class: 'conditions-input',
    rows: 8,
    placeholder: t().assignment.conditionsPlaceholder,
    'aria-label': t().assignment.conditions,
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
        h('label', { class: 'field-label' }, t().assignment.theme),
        theme,
        h('p', { class: 'hint' }, t().assignment.themeHint),
      ),
      h(
        'section',
        { class: 'field' },
        h('label', { class: 'field-label' }, t().assignment.counts),
        words.row,
        sentences.row,
        h('p', { class: 'hint' }, t().assignment.countsHint),
      ),
      h(
        'section',
        { class: 'field' },
        h('label', { class: 'field-label' }, t().assignment.conditions),
        conditions,
        h('p', { class: 'hint' }, t().assignment.conditionsHint),
      ),
    ),
  )
}
