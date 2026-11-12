/**
 * AI の採点の結果（DB の `feedbacks` に JSON で持つ。`docs/plans/archive/ai-scoring.md`）。サーバとブラウザで共有する。
 *
 * - 固定基準で 100 点満点: 構成 30 / 内容 25 / 文法 20 / 語彙・表現 15 / 課題の条件 10
 * - 合計はアプリが観点の点数を足して出す（AI の合計は使わない）
 * - 指摘は観点・本文からの短い引用・ヒント・修正例の英文（2026-11-11 から。`docs/plans/archive/scoring-fix-sentences.md`）
 * - 綴りの誤り（誤字）は指摘とは別に、まとめて「本文の綴り → 正しい綴り」で持つ（2026-11-11 から。`docs/plans/archive/scoring-spellings.md`）
 * - 最新の 1 回分だけを持つ。採点した下書きの本文も入れ、後で本文が変わったか比べる
 */

export const CRITERIA = [
  { key: 'structure', label: '構成', max: 30 },
  { key: 'content', label: '内容', max: 25 },
  { key: 'grammar', label: '文法', max: 20 },
  { key: 'vocabulary', label: '語彙・表現', max: 15 },
  { key: 'requirements', label: '課題の条件', max: 10 },
] as const

export type CriterionKey = (typeof CRITERIA)[number]['key']

export const CRITERION_KEYS: readonly CriterionKey[] = CRITERIA.map((c) => c.key)

export function isCriterionKey(value: unknown): value is CriterionKey {
  return typeof value === 'string' && (CRITERION_KEYS as readonly string[]).includes(value)
}

export function criterionOf(key: CriterionKey): (typeof CRITERIA)[number] {
  return CRITERIA.find((c) => c.key === key) ?? CRITERIA[0]
}

export interface CriterionScore {
  score: number
  /** 一言（日本語）。 */
  comment: string
}

export interface Finding {
  criterion: CriterionKey
  /** 本文からの短い引用（問題の場所を示す。直す前のまま）。空なら全体についての指摘。 */
  quote: string
  /** 直すためのヒント（日本語）。 */
  hint: string
  /** 修正例の英文（引用を直した文。引用が無ければ足す文などの例）。無ければ空（古い結果にも無い）。 */
  fix: string
}

/** 綴りの誤り（誤字）。 */
export interface Spelling {
  /** 本文の綴り（そのまま）。 */
  wrong: string
  /** 正しい綴り。 */
  right: string
}

export interface Feedback {
  version: 1
  /** 採点した時刻（ISO8601）。 */
  scoredAt: string
  /** 採点したモデル（代わりのモデルが採点したらそのモデル）。 */
  model: string
  /** 採点した下書きの本文。 */
  draft: string
  total: number
  scores: Record<CriterionKey, CriterionScore>
  /** よかった点（日本語）。 */
  strengths: string[]
  findings: Finding[]
  /** 綴りの誤りの一覧。古い結果には無い（空として読む）。 */
  spellings: Spelling[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 観点の点数を 0〜満点の整数に収める。 */
export function clampScore(key: CriterionKey, score: unknown): number {
  const n = typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : 0
  return Math.min(criterionOf(key).max, Math.max(0, n))
}

export function totalOf(scores: Record<CriterionKey, CriterionScore>): number {
  return CRITERION_KEYS.reduce((sum, key) => sum + scores[key].score, 0)
}

/** 保存した採点の JSON を読む。形が合わなければ null（手で壊しても画面は落とさない）。 */
export function parseFeedback(text: string): Feedback | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['scores'])) return null
  const raw = value['scores']
  const scores = {} as Record<CriterionKey, CriterionScore>
  for (const key of CRITERION_KEYS) {
    const item = raw[key]
    if (!isRecord(item)) return null
    scores[key] = {
      score: clampScore(key, item['score']),
      comment: typeof item['comment'] === 'string' ? item['comment'] : '',
    }
  }
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  const findings = Array.isArray(value['findings'])
    ? value['findings'].flatMap((f): Finding[] =>
        isRecord(f) && isCriterionKey(f['criterion']) && typeof f['hint'] === 'string'
          ? [
              {
                criterion: f['criterion'],
                quote: typeof f['quote'] === 'string' ? f['quote'] : '',
                hint: f['hint'],
                fix: typeof f['fix'] === 'string' ? f['fix'] : '',
              },
            ]
          : [],
      )
    : []
  return {
    version: 1,
    scoredAt: typeof value['scoredAt'] === 'string' ? value['scoredAt'] : '',
    model: typeof value['model'] === 'string' ? value['model'] : '',
    draft: typeof value['draft'] === 'string' ? value['draft'] : '',
    total: totalOf(scores),
    scores,
    strengths: strings(value['strengths']),
    findings,
    spellings: Array.isArray(value['spellings'])
      ? value['spellings'].flatMap((s): Spelling[] =>
          isRecord(s) && typeof s['wrong'] === 'string' && typeof s['right'] === 'string'
            ? [{ wrong: s['wrong'], right: s['right'] }]
            : [],
        )
      : [],
  }
}
