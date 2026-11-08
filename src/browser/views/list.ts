import { routeHash } from '../../shared/route.js'
import { STAGES } from '../../shared/types.js'
import { listParagraphs } from '../api.js'
import { h, replace } from '../dom.js'
import { errorBox, formatDate, header, STAGE_LABELS } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/**
 * 一覧画面。いまは id・進み具合・更新日だけ。
 * テーマ（各 `assignment.md`）・新規作成・削除は「一覧画面」のタスクで作る。
 */
export function renderList(app: HTMLElement, previousSaved: Promise<void>): View {
  const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, '読み込み中…'))
  replace(
    app,
    header(),
    h('main', { class: 'lwrap' }, h('div', { class: 'lhead' }, h('h1', {}, 'パラグラフ')), grid),
  )
  previousSaved.then(listParagraphs).then(
    (list) => {
      if (list.length === 0) {
        replace(grid, h('p', { class: 'muted' }, 'まだパラグラフはありません。'))
        return
      }
      replace(
        grid,
        ...list.map((p) =>
          h(
            'a',
            { class: 'pc', href: routeHash({ name: 'edit', id: p.id, stage: 'assignment' }) },
            h('h2', {}, p.id),
            h(
              'div',
              { class: 'prog' },
              ...STAGES.map((s) => h('span', { class: p.started[s] ? 'f' : '' })),
            ),
            h('div', { class: 'plabels' }, ...STAGES.map((s) => h('span', {}, STAGE_LABELS[s]))),
            h('div', { class: 'meta' }, h('span', {}, `更新 ${formatDate(p.updatedAt)}`)),
          ),
        ),
      )
    },
    (error: unknown) => replace(grid, errorBox(error)),
  )
  return STATIC_VIEW
}
