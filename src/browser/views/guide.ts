import { h, replace } from '../dom.js'
import { guideTabs } from '../guide-content.js'
import { t } from '../i18n.js'
import { header } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/** 学習ガイド画面。構成の解説・モデル文・表現集のタブ（中身は `guide-content.ts`。編集画面の学習ガイドの引き出しと同じ）。 */
export function renderGuide(app: HTMLElement): View {
  const { tabs, body } = guideTabs(false)
  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', h('b', {}, t().header.guide))], [], 'list'),
    h(
      'main',
      { class: 'gpage' },
      h('div', { class: 'gin' }, h('h1', {}, t().guide.pageTitle), tabs, body),
    ),
  )
  return STATIC_VIEW
}
