/**
 * AI のアイデア出しの結果の形（`docs/plans/archive/ai-ideas.md`）。サーバとブラウザで共有する。
 *
 * - テーマの候補: opinion paragraph 向けの問い（英語）と日本語訳
 * - 理由・例の候補: 賛成側・反対側それぞれの意見（日本語）と、理由（日本語）・例（日本語）
 * - 理由・例の候補は見るだけ（アイデアの段階をなくしたので書き足す先が無い。`docs/plans/ideas-outline.md`）
 */

export interface ThemeSuggestion {
  /** 英語の問い（例: Should students wear school uniforms?）。 */
  en: string
  /** 日本語訳。 */
  ja: string
}

export type Stance = 'for' | 'against'

export const STANCE_LABEL: Readonly<Record<Stance, string>> = { for: '賛成', against: '反対' }

export interface ReasonSuggestion {
  reason: string
  examples: string[]
}

export interface SideSuggestion {
  stance: Stance
  /** その立場の意見（日本語の 1 文）。 */
  opinion: string
  reasons: ReasonSuggestion[]
}

export interface IdeaSuggestions {
  sides: SideSuggestion[]
}

/** アウトラインへの AI の指摘（保存しない）。 */
export interface OutlineReview {
  /** 全体の一言（日本語）。 */
  summary: string
  findings: {
    /** アウトラインの項目からの引用（無ければ空。アウトラインに無い引用は消してある）。 */
    quote: string
    hint: string
  }[]
}
