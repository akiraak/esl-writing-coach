import { h } from './dom.js'
import { guideTabs } from './guide-content.js'

/**
 * 編集画面の右ペイン（学習ガイド）。「構成 / モデル文 / 表現集」を切り替える（中身は `guide-content.ts`。学習ガイド画面と同じ）。
 * AI を足したら AI の結果もここに出す。
 */
export function guidePane(): HTMLElement {
  const { tabs, body } = guideTabs(true)
  return h('aside', { class: 'guide' }, tabs, h('div', { class: 'gbody' }, body))
}
