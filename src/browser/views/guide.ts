import { h, replace } from '../dom.js'
import { header } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/** 学習ガイド画面。構成の解説・モデル文・表現集は「学習ガイド」のタスクで作る。 */
export function renderGuide(app: HTMLElement): View {
  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', h('b', {}, '学習ガイド'))]),
    h(
      'main',
      { class: 'gpage' },
      h('h1', {}, 'Opinion paragraph の書き方'),
      h(
        'p',
        { class: 'muted' },
        '構成の解説・モデル文・表現集は「学習ガイド」のタスクで作ります。',
      ),
    ),
  )
  return STATIC_VIEW
}
