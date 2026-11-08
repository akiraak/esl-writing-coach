import { h } from './dom.js'
import { type ExtraTab, guideTabs } from './guide-content.js'

/**
 * 編集画面の右ペイン。学習ガイド（構成 / モデル文 / 表現集。中身は `guide-content.ts`。学習ガイド画面と同じ）と、
 * AI の結果のタブ（「採点」。`feedback-pane.ts`）を切り替える。
 */
export function guidePane(extra: readonly ExtraTab[] = []): HTMLElement {
  const { tabs, body } = guideTabs(true, extra)
  return h('aside', { class: 'guide' }, tabs, h('div', { class: 'gbody' }, body))
}
