import { AI_TOOL_INFO, AI_TOOLS, type AiTool, aiToolsFor, stepNumber } from '../shared/ai-tools.js'
import type { Stage } from '../shared/types.js'
import { h, replace } from './dom.js'
import { STAGE_LABELS } from './ui.js'

/**
 * 編集画面の右ペイン（AI）。`docs/plans/archive/right-pane-layout.md` の Phase 3。
 *
 * - 今の段階で使う機能（`aiToolsFor`）を上に、ほかの段階の機能は下の「ほかの段階の AI」に畳んで残す
 *   （行に名前・使う段階・出した日時。開けば前の結果を見返せて、押して出し直すこともできる）
 * - 段階を移るときは**カードを作り直さずに並べ替えるだけ**（呼び出し中の状態・入れかけの質問・畳んだ行の開閉を保つ）
 * - カードは `ideas-pane.ts`（テーマの候補・理由と例の候補・アウトラインの指摘）・`draft-chat-pane.ts`（AI に質問）・
 *   `feedback-pane.ts`（採点）が作る
 */

/** 右ペインに並べる 1 つの機能のカード。 */
export interface AiCard {
  el: HTMLElement
  /** 出した日時の短い表示（無ければ「まだ」）。結果が変わると中身も変わる要素を新しく作って返す。 */
  whenLabel(): HTMLElement
  /** 結果が長いカードは、上に出す 2 つ目以降のときに結果を畳む。 */
  setFolded?(folded: boolean): void
}

export interface AiPane {
  el: HTMLElement
  /** 段階を移ったら（上に出す機能と、畳む機能を並べ替える）。 */
  setStage(stage: Stage): void
}

export function createAiPane(cards: Readonly<Record<AiTool, AiCard>>): AiPane {
  const stepTitle = h('h3', { class: 'ai-step' })
  const current = h('div', { class: 'ai-now' })
  const othersList = h('div', {})
  const others = h('div', { class: 'ai-others' }, h('h3', {}, 'ほかの段階の AI'), othersList)
  /** ほかの段階に回ったときの、畳んだ行（開閉の状態を保つよう作り置く）。 */
  const folds = {} as Record<AiTool, HTMLDetailsElement>
  for (const tool of AI_TOOLS) {
    const info = AI_TOOL_INFO[tool]
    folds[tool] = h(
      'details',
      { class: 'ai-other' },
      h(
        'summary',
        {},
        h('b', {}, info.title),
        h('span', { class: 'ai-other-step' }, info.steps),
        cards[tool].whenLabel(),
      ),
    )
  }

  const el = h(
    'aside',
    { class: 'side ai-pane', 'aria-label': 'AI' },
    h(
      'div',
      { class: 'ai-pane-head' },
      h('h2', {}, 'AI'),
      h('small', {}, '押したときだけ呼びます'),
    ),
    h(
      'div',
      { class: 'gbody' },
      stepTitle,
      current,
      others,
      h(
        'p',
        { class: 'muted ai-foot' },
        '押したときだけ、各欄の「送るもの」を Anthropic の API に送ります。AI案に質問すると、その結果とそれまでの質問も送ります。結果と質問はパラグラフごとに最新の 1 回分を残します（「AI に質問」のやりとりは「はじめから」で消すまで）。',
      ),
    ),
  )

  function setStage(stage: Stage): void {
    const tools = aiToolsFor(stage)
    replace(stepTitle, `STEP ${stepNumber(stage)} ${STAGE_LABELS[stage]}で使う AI`)
    tools.current.forEach((tool, i) => {
      cards[tool].setFolded?.(i > 0)
    })
    replace(current, ...tools.current.map((tool) => cards[tool].el))
    for (const tool of tools.others) {
      cards[tool].setFolded?.(false)
      folds[tool].append(cards[tool].el)
    }
    replace(othersList, ...tools.others.map((tool) => folds[tool]))
    others.hidden = tools.others.length === 0
  }

  return { el, setStage }
}

/**
 * カードの出した日時（「2026-11-10 21:05」）。カードの見出し（無ければ空）と、ほかの段階の行（無ければ「まだ」）の両方を
 * 同じ値で描き直す。
 */
export function whenLabels(): {
  create(place: 'head' | 'row'): HTMLElement
  set(text: string): void
} {
  let current = ''
  const els: { el: HTMLElement; place: 'head' | 'row' }[] = []
  const textOf = (place: 'head' | 'row') => (current === '' && place === 'row' ? 'まだ' : current)
  return {
    create(place) {
      const el = h('span', { class: 'ai-when', title: '出した日時' }, textOf(place))
      els.push({ el, place })
      return el
    },
    set(text) {
      current = text
      for (const { el, place } of els) replace(el, textOf(place))
    },
  }
}

/** カードの外枠（見出しと日時・説明・ボタンと送るもの・そのあとの中身）。どのカードも同じ形にする。 */
export function cardFrame(parts: {
  title: string
  when: HTMLElement
  desc: HTMLElement
  /** ボタンの前に置くもの（テーマの分野・キーワードの欄など）。 */
  before?: (Node | null)[]
  /** 押して呼ぶボタン（「AI に質問」は質問の欄から送るので無い）。 */
  button?: HTMLButtonElement
  sends: string
  /** ボタンのあと（エラー・古さの知らせ・結果・質問の欄）。 */
  after: (Node | null)[]
}): HTMLElement {
  return h(
    'section',
    { class: 'ai-card' },
    h('div', { class: 'ai-card-head' }, h('h4', {}, parts.title), parts.when),
    parts.desc,
    ...(parts.before ?? []),
    h(
      'div',
      { class: 'ai-card-act' },
      parts.button ?? null,
      h('span', { class: 'ai-sends' }, `送るもの: ${parts.sends}`),
    ),
    ...parts.after,
  )
}
