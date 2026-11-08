/**
 * AI のアイデア出しの結果の形と、メモへの書き足しの整形（`docs/plans/archive/ai-ideas.md`）。サーバとブラウザで共有する純関数。
 *
 * - テーマの候補: opinion paragraph 向けの問い（英語）と日本語訳
 * - 理由・例の候補: 賛成側・反対側それぞれの意見（日本語）と、理由（日本語）・例（日本語）
 * - メモへは**押したときだけ**書き足す（自動では書き込まない）
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

/** メモに書き足す行（理由と例。どちらの立場かを添える）。 */
export function memoBlock(stance: Stance, reason: ReasonSuggestion): string {
  return [
    `理由（${STANCE_LABEL[stance]}）: ${reason.reason}`,
    ...reason.examples.map((example) => `  例: ${example}`),
  ].join('\n')
}

/** メモの末尾に書き足す。空でなければ空行を 1 つ挟む（末尾の改行の数に合わせる）。 */
export function appendToMemo(memo: string, block: string): string {
  if (memo.trim() === '') return `${block}\n`
  const trimmed = memo.replace(/\n*$/, '')
  return `${trimmed}\n\n${block}\n`
}
