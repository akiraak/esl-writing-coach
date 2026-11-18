import { type CountRange, parseAssignment } from './assignment.js'
import { countWords } from './counting.js'
import { type Lang, MESSAGES } from './i18n/index.js'
import type { CountKind } from './i18n/ja.js'
import { countReasons } from './outline-roles.js'
import type { Stage } from './types.js'

/**
 * 編集画面の段階のタイルに出す、短い状態の行（モックの `120–150 語`・`7 行` など）。純関数。
 *
 * - 課題: 語数の指定（無ければ文数の指定、どちらも無ければ「指定なし」）
 * - アウトライン: 理由の数（`outline-roles.ts`）。理由が無ければ空でない行の数
 * - 下書き: 語数（`counting.ts`）
 * - 中身が空なら「未着手」
 *
 * 文は画面の言語で（`src/shared/i18n/`）。
 */

function countLines(text: string): number {
  return text.split('\n').filter((line) => line.trim() !== '').length
}

/**
 * `120–150 語`・`120 語以上`・`150 語以下`・`120 語`。指定なしは null。
 * AI に渡すプロンプト用（日本語のまま。画面は `describeCountRange`）。
 */
export function describeRange(range: CountRange, unit: string): string | null {
  const { min, max } = range
  if (min !== null && max !== null) return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`
  if (min !== null) return `${min} ${unit}以上`
  if (max !== null) return `${max} ${unit}以下`
  return null
}

/** 画面に出す指定の幅（`120–150 words` / `120–150 語`）。指定なしは null。 */
export function describeCountRange(range: CountRange, kind: CountKind, lang: Lang): string | null {
  const { min, max } = range
  const c = MESSAGES[lang].counts
  if (min !== null && max !== null)
    return min === max ? c.count(min, kind) : c.between(min, max, kind)
  if (min !== null) return c.atLeast(min, kind)
  if (max !== null) return c.atMost(max, kind)
  return null
}

export function summarizeStage(stage: Stage, text: string, lang: Lang): string {
  const m = MESSAGES[lang]
  if (text.trim() === '') return m.summary.notStarted
  switch (stage) {
    case 'assignment': {
      const a = parseAssignment(text)
      return (
        describeCountRange(a.words, 'words', lang) ??
        describeCountRange(a.sentences, 'sentences', lang) ??
        m.counts.none
      )
    }
    case 'outline': {
      const reasons = countReasons(text)
      return reasons > 0 ? m.summary.reasons(reasons) : m.summary.items(countLines(text))
    }
    case 'draft':
      return m.counts.count(countWords(text), 'words')
  }
}
