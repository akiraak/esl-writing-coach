import { countSentences, countWords } from '../shared/counting.js'
import { FLOW, MODEL, PHRASES, STRUCTURE } from '../shared/guide.js'
import { outlineRoles } from '../shared/outline-roles.js'
import type { GuideTabKey } from '../shared/side-pane.js'
import { h, replace } from './dom.js'
import { insertPhrase } from './phrase-target.js'
import { ROLE_KEY, roleNodes } from './role-list.js'

/**
 * 学習ガイドの中身の描き方（中身は `src/shared/guide.ts`。パラグラフにも段階にもよらない固定のもの）。
 * 学習ガイド画面と、編集画面の学習ガイドの引き出し（`guide-pane.ts`）で同じものを出す。
 * 引き出しは幅が狭いので `compact`（1 列の詰めた形）。引き出しで開くタブは段階ごとに決める（`guide-pane.ts`）。
 */

export type GuideTab = GuideTabKey

export const GUIDE_TABS: readonly { key: GuideTab; label: string; short: string }[] = [
  { key: 'structure', label: '構成の解説', short: '構成' },
  { key: 'model', label: 'モデル文', short: 'モデル文' },
  { key: 'phrases', label: '表現集', short: '表現集' },
]

/** 学習ガイド画面で選んだタブ（このブラウザのタブを開いている間は覚える）。 */
let pageSelected: GuideTab = 'structure'

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
 * 表現集。`insertable`（引き出しで下書きを開いているとき）なら各表現を押せて、カーソルの位置に入る（`phrase-target.ts`）。
 * 押しても本文の欄からフォーカスとカーソルの位置を奪わないよう、`mousedown` を止める。
 * `compact` で押せないとき（引き出しで課題・アウトラインを開いているとき）は見るだけの形にして、STEP 3 で押せると知らせる。
 */
function phrasesBody(insertable: boolean, compact: boolean): HTMLElement {
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
      : compact
        ? h(
            'p',
            { class: 'muted phr-hint' },
            'STEP 3（下書き）で押すと本文に入ります。ここでは見るだけ。',
          )
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

function bodyOf(tab: GuideTab, compact: boolean, insertable: boolean): HTMLElement {
  switch (tab) {
    case 'structure':
      return structureBody()
    case 'model':
      return modelBody()
    case 'phrases':
      return phrasesBody(insertable, compact)
  }
}

export interface GuideTabsOptions {
  /** 表現集を押して本文に入れられるか（引き出しで下書きを開いているときだけ）。 */
  insertable?(): boolean
  /** おすすめのタブ（印を付ける。引き出しの段階ごと）。 */
  recommended?(): GuideTab | null
  /** タブを自分で選んだとき（引き出しは段階ごとに覚える）。 */
  onSelect?(tab: GuideTab): void
}

export interface GuideTabs {
  tabs: HTMLElement
  body: HTMLElement
  /** タブを選んで描き直す（引き出しで段階を移ったとき）。 */
  select(tab: GuideTab): void
}

/**
 * タブと中身。`compact` は引き出し向け（タブの名前を短く、タブの見た目は `seg`。学習ガイド画面は `gtabs`）。
 * `options` を渡さなければ学習ガイド画面の形（選んだタブは `pageSelected` に覚える）。
 */
export function guideTabs(compact: boolean, options: GuideTabsOptions = {}): GuideTabs {
  const body = h('div', { class: `guide-content${compact ? ' compact' : ''}` })
  const usePage = options.onSelect === undefined
  let selected: GuideTab = usePage ? pageSelected : 'structure'
  const marks = GUIDE_TABS.map(() =>
    h(
      'span',
      { class: 'gtab-rec', title: 'この段階のおすすめ', 'aria-label': '（おすすめ）' },
      '●',
    ),
  )
  const buttons = GUIDE_TABS.map((tab, i) =>
    h(
      'button',
      {
        type: 'button',
        onclick: () => {
          select(tab.key)
          if (usePage) pageSelected = tab.key
          options.onSelect?.(tab.key)
        },
      },
      compact ? tab.short : tab.label,
      marks[i],
    ),
  )
  function select(tab: GuideTab): void {
    selected = tab
    const recommended = options.recommended?.() ?? null
    GUIDE_TABS.forEach((t, i) => {
      buttons[i]?.classList.toggle('on', t.key === selected)
      buttons[i]?.setAttribute('aria-pressed', String(t.key === selected))
      if (marks[i]) marks[i].hidden = t.key !== recommended
    })
    replace(body, bodyOf(selected, compact, options.insertable?.() ?? false))
  }
  select(selected)
  return { tabs: h('div', { class: compact ? 'seg' : 'gtabs' }, ...buttons), body, select }
}
