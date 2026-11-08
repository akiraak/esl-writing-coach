import { countSentences, countWords } from '../shared/counting.js'
import { FLOW, MODEL, PHRASES, STRUCTURE } from '../shared/guide.js'
import { outlineRoles } from '../shared/outline-roles.js'
import { h, replace } from './dom.js'
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

let selected: GuideTab = 'structure'

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
    h('h3', { class: 'gsub' }, 'このモデル文のアウトライン（STEP 3 の見本）'),
    h('div', { class: 'model-outline' }, ...roleNodes(outlineRoles(MODEL.outline))),
    h('h3', { class: 'gsub' }, '書き方のポイント'),
    h('ul', { class: 'points' }, ...MODEL.points.map((point) => h('li', {}, point))),
  )
}

function phrasesBody(): HTMLElement {
  return h(
    'div',
    { class: 'phr' },
    ...PHRASES.map((group) =>
      h(
        'div',
        { class: `pg${group.role === null ? '' : ` p-${ROLE_KEY[group.role]}`}` },
        h('h3', {}, group.title),
        h(
          'div',
          { class: 'phrases' },
          ...group.phrases.map((phrase) =>
            h(
              'span',
              { class: 'phrase' },
              h('code', { lang: 'en' }, phrase.en),
              h('small', {}, phrase.ja),
            ),
          ),
        ),
      ),
    ),
  )
}

function bodyOf(tab: GuideTab): HTMLElement {
  switch (tab) {
    case 'structure':
      return structureBody()
    case 'model':
      return modelBody()
    case 'phrases':
      return phrasesBody()
  }
}

/** タブと中身。`compact` は右ペイン向け（タブの名前を短く、タブの見た目は `seg`。学習ガイド画面は `gtabs`）。 */
export function guideTabs(compact: boolean): { tabs: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: `guide-content${compact ? ' compact' : ''}` })
  const buttons = GUIDE_TABS.map((tab) =>
    h(
      'button',
      {
        type: 'button',
        onclick: () => {
          selected = tab.key
          show()
        },
      },
      compact ? tab.short : tab.label,
    ),
  )
  const show = () => {
    GUIDE_TABS.forEach((tab, i) => {
      buttons[i]?.classList.toggle('on', tab.key === selected)
      buttons[i]?.setAttribute('aria-pressed', String(tab.key === selected))
    })
    replace(body, bodyOf(selected))
  }
  show()
  return { tabs: h('div', { class: compact ? 'seg' : 'gtabs' }, ...buttons), body }
}
