import type { CountRange } from './assignment.js'

/**
 * 下書きの語数・文数のメーター（モックの `.meter`）。数と課題の指定の幅から、状態・文言・帯と目盛りの位置を出す。純関数。
 *
 * - 目盛りの最大は「指定の上限（無ければ下限）の 1.2 倍」と「今の数」の大きい方
 * - 位置は 0〜100（%）
 */

export type MeterStatus = 'none' | 'under' | 'within' | 'over'

export interface Meter {
  count: number
  status: MeterStatus
  /** 「あと 52 語」「範囲内」「12 語多い」「指定なし」。 */
  message: string
  /** 今の数の位置（%）。 */
  fill: number
  /** 指定の幅の帯（%）。指定なしは null。 */
  band: { from: number; to: number } | null
  /** 目盛り（指定の下限・上限）。 */
  ticks: { value: number; at: number }[]
}

export function meterOf(count: number, range: CountRange, unit: string): Meter {
  const { min, max } = range
  const upper = max ?? min
  if (upper === null) {
    return { count, status: 'none', message: '指定なし', fill: 0, band: null, ticks: [] }
  }
  const scale = Math.max(upper * 1.2, count, 1)
  const at = (value: number) => Math.min(100, (value / scale) * 100)
  let status: MeterStatus = 'within'
  let message = '範囲内'
  if (min !== null && count < min) {
    status = 'under'
    message = `あと ${min - count} ${unit}`
  } else if (max !== null && count > max) {
    status = 'over'
    message = `${count - max} ${unit}多い`
  }
  const values = [...new Set([min, max].filter((v): v is number => v !== null))]
  return {
    count,
    status,
    message,
    fill: at(count),
    band: { from: at(min ?? 0), to: at(max ?? scale) },
    ticks: values.map((value) => ({ value, at: at(value) })),
  }
}
