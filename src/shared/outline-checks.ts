import { type Lang, MESSAGES } from './i18n/index.js'
import { outlineRoles } from './outline-roles.js'

/**
 * アウトラインが opinion paragraph の型に合っているかのチェック（AI なし。`docs/plans/archive/outline-ai-feedback.md`）。純関数。
 * 役割の決め方は下書きの横のリストと同じ（`outline-roles.ts`）。
 */

export interface OutlineCheck {
  ok: boolean
  label: string
  /** 足りないときの説明。 */
  detail: string
}

export const MIN_REASONS = 2
export const MAX_REASONS = 3

export function checkOutline(text: string, lang: Lang): OutlineCheck[] {
  const m = MESSAGES[lang].outlineChecks
  const items = outlineRoles(text)
  const topics = items.filter((i) => i.role === 'topic')
  const reasons = items.filter((i) => i.role === 'reason')
  const hasConclusion = items.some((i) => i.role === 'conclusion')

  // 例の無い理由（理由のすぐ後ろに、次の理由・結論・意見より前に例が無い）
  const bare: string[] = []
  items.forEach((item, index) => {
    if (item.role !== 'reason') return
    const next = items[index + 1]
    if (next?.role !== 'example') bare.push(item.label.split('\n')[0] ?? '')
  })

  return [
    {
      ok: topics.length === 1,
      label: m.oneTopic,
      detail: topics.length === 0 ? m.noTopic : m.manyTopics(topics.length),
    },
    {
      ok: reasons.length >= MIN_REASONS && reasons.length <= MAX_REASONS,
      label: m.reasons(MIN_REASONS, MAX_REASONS),
      detail:
        reasons.length < MIN_REASONS ? m.fewReasons(reasons.length) : m.manyReasons(reasons.length),
    },
    {
      ok: reasons.length > 0 && bare.length === 0,
      label: m.examples,
      detail: reasons.length === 0 ? m.noReasons : m.bareReasons(bare.join(' / ')),
    },
    {
      ok: hasConclusion,
      label: m.conclusion,
      detail: m.noConclusion,
    },
  ]
}
