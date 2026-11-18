import type { Assignment } from '../../shared/assignment.js'
import { routeHash } from '../../shared/route.js'
import { describeCountRange } from '../../shared/stage-summary.js'
import { h } from '../dom.js'
import { getLang, t } from '../i18n.js'

/**
 * 課題のテーマと条件を小さく出す帯（アウトライン・下書きの画面の上。モックの `.req`）。
 * テーマが空なら課題の画面へのリンクを出す。
 */
export function assignmentBrief(id: string, assignment: Assignment): HTMLElement {
  const toAssignment = routeHash({ name: 'edit', id, stage: 'assignment' })
  const lang = getLang()
  const counts = [
    describeCountRange(assignment.words, 'words', lang),
    describeCountRange(assignment.sentences, 'sentences', lang),
  ]
    .filter((x) => x !== null)
    .join(t().brief.separator)
  const conditions = assignment.conditions.trim()
  return h(
    'div',
    { class: 'brief' },
    assignment.theme === ''
      ? h(
          'div',
          { class: 'brief-theme empty' },
          t().brief.noTheme,
          h('a', { href: toAssignment }, t().brief.toAssignment),
        )
      : h('div', { class: 'brief-theme' }, assignment.theme),
    counts === '' && conditions === ''
      ? null
      : h(
          'div',
          { class: 'req' },
          h('b', {}, t().brief.conditions),
          counts === '' ? null : h('span', { class: 'req-counts' }, counts),
          conditions === '' ? null : h('span', { class: 'req-text' }, conditions),
        ),
  )
}
