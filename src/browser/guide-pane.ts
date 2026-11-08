import { h, replace } from './dom.js'

/**
 * 編集画面の右ペイン（学習ガイド）。「構成 / モデル文 / 表現集」を切り替える。
 * 中身は「学習ガイド」のタスクで入れる（学習ガイド画面と同じものを出す）。AI を足したら AI の結果もここに出す。
 */

const TABS = [
  { key: 'structure', label: '構成' },
  { key: 'model', label: 'モデル文' },
  { key: 'phrases', label: '表現集' },
] as const
type Tab = (typeof TABS)[number]['key']

/** 選んだタブ。パラグラフや段階を移っても保つ（このタブを開いている間だけ）。 */
let selected: Tab = 'structure'

function tabBody(tab: Tab): HTMLElement {
  const label = TABS.find((t) => t.key === tab)?.label ?? ''
  return h('p', { class: 'muted' }, `${label}は「学習ガイド」のタスクで作ります。`)
}

export function guidePane(): HTMLElement {
  const body = h('div', { class: 'gbody' })
  const buttons = TABS.map((tab) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(tab.key === selected),
        onclick: () => {
          selected = tab.key
          show()
        },
      },
      tab.label,
    ),
  )
  const show = () => {
    TABS.forEach((tab, i) => {
      const button = buttons[i]
      if (button === undefined) return
      button.classList.toggle('on', tab.key === selected)
      button.setAttribute('aria-pressed', String(tab.key === selected))
    })
    replace(body, tabBody(selected))
  }
  show()
  return h('aside', { class: 'guide' }, h('div', { class: 'seg' }, ...buttons), body)
}
