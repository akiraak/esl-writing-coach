import { CRITERIA, type CriterionKey, type Feedback, type Finding } from './feedback.js'

/**
 * 間違いの振り返りの集計（`docs/plans/archive/review.md`）。純関数。
 *
 * パラグラフごとの最新の採点（`feedback.json`）を横断して、観点ごとの平均・いちばん低い観点・点数の推移・観点ごとの指摘を出す。
 */

/** 振り返りの 1 件（`GET /api/review`）。 */
export interface ReviewEntry {
  id: string
  theme: string
  feedback: Feedback
}

export interface CriterionAverage {
  key: CriterionKey
  label: string
  max: number
  /** 平均点（小数 1 桁）。 */
  average: number
  /** 満点に対する割合（0〜100 の整数）。 */
  percent: number
}

export interface ReviewFinding extends Finding {
  id: string
  theme: string
  scoredAt: string
}

export interface ReviewSummary {
  count: number
  /** 合計の平均（小数 1 桁）。採点が無ければ null。 */
  averageTotal: number | null
  criteria: CriterionAverage[]
  /** 満点に対する割合がいちばん低い観点（伸ばしたいところ）。採点が無ければ null。 */
  weakest: CriterionKey | null
  /** 採点した日の古い順。 */
  timeline: ReviewEntry[]
  /** 観点ごとの指摘（新しい採点のものから）。観点の並びは指摘の多い順（同じ数なら基準の順）。 */
  findings: { key: CriterionKey; label: string; items: ReviewFinding[] }[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function summarizeReview(entries: readonly ReviewEntry[]): ReviewSummary {
  const count = entries.length
  const timeline = [...entries].sort((a, b) =>
    a.feedback.scoredAt === b.feedback.scoredAt
      ? a.id.localeCompare(b.id)
      : a.feedback.scoredAt < b.feedback.scoredAt
        ? -1
        : 1,
  )
  const criteria: CriterionAverage[] = CRITERIA.map((c) => {
    const sum = entries.reduce((s, e) => s + e.feedback.scores[c.key].score, 0)
    const average = count === 0 ? 0 : sum / count
    return {
      key: c.key,
      label: c.label,
      max: c.max,
      average: round1(average),
      percent: Math.round((average / c.max) * 100),
    }
  })
  let weakest: CriterionKey | null = null
  if (count > 0) {
    let low = Number.POSITIVE_INFINITY
    for (const c of criteria) {
      const ratio = c.average / c.max
      if (ratio < low) {
        low = ratio
        weakest = c.key
      }
    }
  }
  const newestFirst = [...timeline].reverse()
  const findings = CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    items: newestFirst.flatMap((e) =>
      e.feedback.findings
        .filter((f) => f.criterion === c.key)
        .map((f) => ({ ...f, id: e.id, theme: e.theme, scoredAt: e.feedback.scoredAt })),
    ),
  }))
    .map((group, order) => ({ group, order }))
    .sort((a, b) => b.group.items.length - a.group.items.length || a.order - b.order)
    .map(({ group }) => group)
  return {
    count,
    averageTotal:
      count === 0 ? null : round1(entries.reduce((s, e) => s + e.feedback.total, 0) / count),
    criteria,
    weakest,
    timeline,
    findings,
  }
}
