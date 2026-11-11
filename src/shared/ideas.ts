/**
 * AI のアイデア出しの結果の形（`docs/plans/archive/ai-ideas.md`）。サーバとブラウザで共有する。
 *
 * - テーマの候補: opinion paragraph 向けの問い（英語）と日本語訳
 * - 理由・例の候補: 賛成側・反対側それぞれの意見（日本語）と、理由（日本語）・例（日本語）
 * - 理由・例の候補は見るだけ（アイデアの段階をなくしたので書き足す先が無い。`docs/plans/archive/ideas-outline.md`）
 * - パラグラフごとに種類ごとの最新の 1 回分を、出したときの入力と一緒に DB に持つ（`SavedAiResults`。`docs/plans/sqlite-storage.md`）
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

/** アウトラインへの AI の指摘。 */
export interface OutlineReview {
  /** 全体の一言（日本語）。 */
  summary: string
  findings: {
    /** アウトラインの項目からの引用（無ければ空。アウトラインに無い引用は消してある）。 */
    quote: string
    hint: string
  }[]
}

/** 保存する AI案の種類。 */
export const AI_KINDS = ['themes', 'ideas', 'outline'] as const
export type AiKind = (typeof AI_KINDS)[number]

export interface SavedThemes {
  /** 入れた分野・キーワード。 */
  hint: string
  themes: ThemeSuggestion[]
  /** 出した時刻（ISO8601）。 */
  createdAt: string
}

export interface SavedIdeas {
  /** 出したときの課題のテーマと条件。 */
  theme: string
  conditions: string
  ideas: IdeaSuggestions
  createdAt: string
}

export interface SavedOutlineReview {
  /** 出したときの課題のテーマと条件・アウトライン。 */
  theme: string
  conditions: string
  outline: string
  review: OutlineReview
  createdAt: string
}

/** パラグラフの AI案（`GET /api/paragraphs/:id/ai`）。まだ出していない種類は null。 */
export interface SavedAiResults {
  themes: SavedThemes | null
  ideas: SavedIdeas | null
  outline: SavedOutlineReview | null
}

/** 理由・例の候補を出したあとで、課題のテーマか条件を変えたか（テーマは前後の空白を落として比べる）。 */
export function isIdeasStale(saved: SavedIdeas, theme: string, conditions: string): boolean {
  return saved.theme !== theme.trim() || saved.conditions !== conditions
}

/** アウトラインの指摘のあとで、アウトライン・課題のテーマか条件を変えたか。 */
export function isOutlineReviewStale(
  saved: SavedOutlineReview,
  theme: string,
  conditions: string,
  outline: string,
): boolean {
  return saved.outline !== outline || saved.theme !== theme || saved.conditions !== conditions
}
