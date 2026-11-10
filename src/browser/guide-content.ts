import { countSentences, countWords } from '../shared/counting.js'
import { FLOW, MODEL, PHRASES, STRUCTURE } from '../shared/guide.js'
import { outlineRoles } from '../shared/outline-roles.js'
import { h, replace } from './dom.js'
import { insertPhrase } from './phrase-target.js'
import { ROLE_KEY, roleNodes } from './role-list.js'

/**
 * 学習ガイドの中身の描き方（中身は `src/shared/guide.ts`）。学習ガイド画面と編集画面の右ペインで同じものを出す。
 * 右ペインは幅が狭いので `compact`（1 列の詰めた形）。選んだタブは両方で共有する（このタブを開いている間）。
 */

export const GUIDE_TABS = [
  { key: 'structure', label: '構成の解説', short: '構成' },
  { key: 'model', label: 'モデル文', short: 'モデル文' },
  { key: 'phrases', label: '表現集', short: '表現集' },
] as const
export type GuideTab = (typeof GUIDE_TABS)[number]['key']

/** 選んだタブ（学習ガイド画面と右ペインで共有。右ペインだけの「採点」も入る）。 */
let selected: string = 'structure'

const legend = () =>
  h(
    'div',
    { class: 'legend' },
    ...STRUCTURE.map((part) =>
      h('span', {}, h('i', { class: `sw-${ROLE_KEY[part.role]}` }), part.name),
    ),
  )

function structureBody(): HTMLElement {
  const flow: (Node | string)[] = []
  FLOW.forEach((step, i) => {
    // Reason と Example は 1 組なので、組の間にだけ矢印を置く
    if (i > 0 && step.role !== 'example') flow.push(h('span', { class: 'arrow' }, '→'))
    flow.push(h('span', { class: `chip c-${ROLE_KEY[step.role]}` }, step.label))
  })
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'parts' },
      ...STRUCTURE.map((part) =>
        h(
          'div',
          { class: `part p-${ROLE_KEY[part.role]}` },
          h('h3', {}, part.name, h('small', {}, part.ja)),
          h('p', {}, part.description),
        ),
      ),
    ),
    h('div', { class: 'flow' }, h('span', { class: 'flow-label' }, '並び:'), ...flow),
  )
}

function modelBody(): HTMLElement {
  const text = MODEL.sentences.map((s) => s.text).join(' ')
  const paragraph = h('p', { class: 'model', lang: 'en' })
  MODEL.sentences.forEach((sentence, i) => {
    if (i > 0) paragraph.append(' ')
    paragraph.append(h('span', { class: `hl-${ROLE_KEY[sentence.role]}` }, sentence.text))
  })
  return h(
    'div',
    {},
    h('p', { class: 'model-theme' }, MODEL.theme),
    paragraph,
    legend(),
    h('p', { class: 'muted model-stats' }, `${countWords(text)} 語 ・ ${countSentences(text)} 文`),
    h('h3', { class: 'gsub' }, 'このモデル文のアウトライン（STEP 2 の見本）'),
    h('div', { class: 'model-outline' }, ...roleNodes(outlineRoles(MODEL.outline))),
    h('h3', { class: 'gsub' }, '書き方のポイント'),
    h('ul', { class: 'points' }, ...MODEL.points.map((point) => h('li', {}, point))),
  )
}

/**
 * 表現集。`insertable`（右ペイン）なら各表現を押せて、下書きを開いていればカーソルの位置に入る（`phrase-target.ts`）。
 * 押しても本文の欄からフォーカスとカーソルの位置を奪わないよう、`mousedown` を止める。
 */
function phrasesBody(insertable: boolean): HTMLElement {
  const notice = h('p', { class: 'phr-notice' })
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const chip = (phrase: { en: string; ja: string }) => {
    const parts = [h('code', { lang: 'en' }, phrase.en), h('small', {}, phrase.ja)]
    if (!insertable) return h('span', { class: 'phrase' }, ...parts)
    return h(
      'button',
      {
        type: 'button',
        class: 'phrase',
        title: '下書きのカーソルの位置に入れる',
        onmousedown: (event: Event) => event.preventDefault(),
        onclick: () => {
          if (insertPhrase(phrase.en)) return
          // 下書きを開いていなければ知らせる（段階を移ってから残らないよう、数秒で消す）
          replace(notice, '下書き（STEP 3）を開くと、押して本文に入れられます。')
          clearTimeout(noticeTimer)
          noticeTimer = setTimeout(() => replace(notice), 4000)
        },
      },
      ...parts,
    )
  }
  return h(
    'div',
    {},
    insertable
      ? h('p', { class: 'muted phr-hint' }, '押すと下書きのカーソルの位置に入ります。')
      : null,
    insertable ? notice : null,
    h(
      'div',
      { class: 'phr' },
      ...PHRASES.map((group) =>
        h(
          'div',
          { class: `pg${group.role === null ? '' : ` p-${ROLE_KEY[group.role]}`}` },
          h('h3', {}, group.title),
          h('div', { class: 'phrases' }, ...group.phrases.map(chip)),
        ),
      ),
    ),
  )
}

function bodyOf(tab: GuideTab, compact: boolean): HTMLElement {
  switch (tab) {
    case 'structure':
      return structureBody()
    case 'model':
      return modelBody()
    case 'phrases':
      return phrasesBody(compact)
  }
}

/** 学習ガイドのほかに足すタブ（編集画面の右ペインの「採点」）。中身の要素は作り置きを使い回す。 */
export interface ExtraTab {
  key: string
  label: string
  el: HTMLElement
}

/**
 * タブと中身。`compact` は右ペイン向け（タブの名前を短く、タブの見た目は `seg`。学習ガイド画面は `gtabs`）。
 * `extra` のタブは右ペインだけのもの。選んだタブが無い画面（学習ガイド画面で「採点」を選んでいた）では構成を出す。
 */
export function guideTabs(
  compact: boolean,
  extra: readonly ExtraTab[] = [],
): { tabs: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: `guide-content${compact ? ' compact' : ''}` })
  const tabs = [
    ...GUIDE_TABS.map((tab) => ({
      key: tab.key as string,
      label: compact ? tab.short : tab.label,
      render: () => bodyOf(tab.key, compact),
    })),
    ...extra.map((tab) => ({ key: tab.key, label: tab.label, render: () => tab.el })),
  ]
  const current = () => (tabs.some((t) => t.key === selected) ? selected : GUIDE_TABS[0].key)
  const buttons = tabs.map((tab) =>
    h(
      'button',
      {
        type: 'button',
        onclick: () => {
          selected = tab.key
          show()
        },
      },
      tab.label,
    ),
  )
  const show = () => {
    const key = current()
    tabs.forEach((tab, i) => {
      buttons[i]?.classList.toggle('on', tab.key === key)
      buttons[i]?.setAttribute('aria-pressed', String(tab.key === key))
    })
    replace(body, tabs.find((t) => t.key === key)?.render() ?? null)
  }
  show()
  return { tabs: h('div', { class: compact ? 'seg' : 'gtabs' }, ...buttons), body }
}
