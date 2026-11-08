import { h, replace } from '../dom.js'
import { guideTabs } from '../guide-content.js'
import { header } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/** 学習ガイド画面。構成の解説・モデル文・表現集のタブ（中身は `guide-content.ts`。編集画面の右ペインと同じ）。 */
export function renderGuide(app: HTMLElement): View {
  const { tabs, body } = guideTabs(false)
  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', h('b', {}, '学習ガイド'))], [], true),
    h(
      'main',
      { class: 'gpage' },
      h('div', { class: 'gin' }, h('h1', {}, 'Opinion paragraph の書き方'), tabs, body),
    ),
  )
  return STATIC_VIEW
}
