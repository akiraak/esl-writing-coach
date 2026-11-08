import { type CountRange, parseAssignment } from './assignment.js'
import type { Stage } from './types.js'

/**
 * 編集画面の段階のタイルに出す、短い状態の行（モックの `120–150 語`・`7 行` など）。純関数。
 *
 * - 課題: 語数の指定（無ければ文数の指定、どちらも無ければ「指定なし」）
 * - アイデア: 空でない行の数
 * - アウトライン: 空でない行の数。役割ごとの数（「理由 3」）は、深さ → 役割の規則を決める下書きのタスクで差し替える
 * - 下書き: 語数（数え方は仮。下書きのタスクで詰める）
 * - 中身が空なら「未着手」
 */

export const NOT_STARTED = '未着手'

/** 英数字の並びを 1 語と数える（`don't`・`well-known`・`3.5` は 1 語）。仮の数え方。 */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function countLines(text: string): number {
  return text.split('\n').filter((line) => line.trim() !== '').length
}

/** `120–150 語`・`120 語以上`・`150 語以下`・`120 語`。指定なしは null。 */
export function describeRange(range: CountRange, unit: string): string | null {
  const { min, max } = range
  if (min !== null && max !== null) return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`
  if (min !== null) return `${min} ${unit}以上`
  if (max !== null) return `${max} ${unit}以下`
  return null
}

export function summarizeStage(stage: Stage, text: string): string {
  if (text.trim() === '') return NOT_STARTED
  switch (stage) {
    case 'assignment': {
      const a = parseAssignment(text)
      return describeRange(a.words, '語') ?? describeRange(a.sentences, '文') ?? '指定なし'
    }
    case 'ideas':
      return `${countLines(text)} 行`
    case 'outline':
      return `${countLines(text)} 項目`
    case 'draft':
      return `${countWords(text)} 語`
  }
}
