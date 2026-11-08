import type { Assignment } from '../../shared/assignment.js'
import { routeHash } from '../../shared/route.js'
import { describeRange } from '../../shared/stage-summary.js'
import { h } from '../dom.js'

/**
 * 課題のテーマと条件を小さく出す帯（アイデア・下書きの画面の上。モックの `.req`）。
 * テーマが空なら課題の画面へのリンクを出す。
 */
export function assignmentBrief(id: string, assignment: Assignment): HTMLElement {
  const toAssignment = routeHash({ name: 'edit', id, stage: 'assignment' })
  const counts = [describeRange(assignment.words, '語'), describeRange(assignment.sentences, '文')]
    .filter((x) => x !== null)
    .join(' ・ ')
  const conditions = assignment.conditions.trim()
  return h(
    'div',
    { class: 'brief' },
    assignment.theme === ''
      ? h(
          'div',
          { class: 'brief-theme empty' },
          'テーマがまだありません。',
          h('a', { href: toAssignment }, '課題で入れる'),
        )
      : h('div', { class: 'brief-theme' }, assignment.theme),
    counts === '' && conditions === ''
      ? null
      : h(
          'div',
          { class: 'req' },
          h('b', {}, '課題の条件'),
          counts === '' ? null : h('span', { class: 'req-counts' }, counts),
          conditions === '' ? null : h('span', { class: 'req-text' }, conditions),
        ),
  )
}
