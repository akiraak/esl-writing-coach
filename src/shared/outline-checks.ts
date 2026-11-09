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

export function checkOutline(text: string): OutlineCheck[] {
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
      label: '意見（中心）が 1 つ',
      detail:
        topics.length === 0
          ? '中心に意見を書こう。'
          : `意見が ${topics.length} つあります（字下げ 0 の行が複数）。1 つにまとめよう。`,
    },
    {
      ok: reasons.length >= MIN_REASONS && reasons.length <= MAX_REASONS,
      label: `理由が ${MIN_REASONS}〜${MAX_REASONS} つ`,
      detail:
        reasons.length < MIN_REASONS
          ? `理由が ${reasons.length} つです。中心の子として理由を足そう。`
          : `理由が ${reasons.length} つです。説得力のあるものに絞ろう（課題の指定があればそれに合わせる）。`,
    },
    {
      ok: reasons.length > 0 && bare.length === 0,
      label: 'どの理由にも例・詳細',
      detail:
        reasons.length === 0
          ? '理由を書いたら、その子として例・詳細を足そう。'
          : `例・詳細の無い理由: ${bare.join(' / ')}`,
    },
    {
      ok: hasConclusion,
      label: '結論',
      detail: '中心の最後の子として「結論: …」を足そう。',
    },
  ]
}
