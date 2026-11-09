import { describeError, log } from '../log.js'
import { parseFeedback } from '../shared/feedback.js'
import type { ReviewEntry } from '../shared/review.js'
import type { ParagraphSummary } from '../shared/types.js'
import type { ParagraphStore } from './store.js'

/**
 * 振り返りのために、採点のあるパラグラフの `feedback.json` とテーマを読む（`docs/plans/archive/review.md`）。
 *
 * - **id + rev で覚えておき**、一覧の rev が変わっていなければ読み直さない（一覧のテーマと同じ考え方）
 * - 読めない・壊れた `feedback.json` は飛ばす（振り返り全体は失敗させない。warn を出す）
 * - テーマは一覧のテーマ（`ThemeReader`）から受け取る
 */

/** 同時に読む件数の上限。 */
const CONCURRENCY = 6

export interface FeedbackReader {
  /** `themes` は id → テーマ（一覧で読んだもの）。 */
  entries(
    summaries: ParagraphSummary[],
    themes: ReadonlyMap<string, string>,
  ): Promise<ReviewEntry[]>
}

export function createFeedbackReader(store: Pick<ParagraphStore, 'readFeedback'>): FeedbackReader {
  const cache = new Map<string, { rev: string; entry: Omit<ReviewEntry, 'theme'> | null }>()

  async function read(summary: ParagraphSummary): Promise<Omit<ReviewEntry, 'theme'> | null> {
    const meta = summary.feedback
    if (meta === undefined) return null
    const cached = cache.get(summary.id)
    if (cached?.rev === meta.rev) return cached.entry
    try {
      const file = await store.readFeedback(summary.id)
      if (file === null) return null
      const feedback = parseFeedback(file.text)
      if (feedback === null) log.warn(`${summary.id} の feedback.json を読めません（形が違います）`)
      const entry = feedback === null ? null : { id: summary.id, feedback }
      cache.set(summary.id, { rev: file.rev, entry })
      return entry
    } catch (error) {
      log.warn(`${summary.id} の feedback.json を読めません: ${describeError(error)}`)
      return null
    }
  }

  return {
    async entries(summaries, themes) {
      const targets = summaries.filter((s) => s.feedback !== undefined)
      const results: (Omit<ReviewEntry, 'theme'> | null)[] = new Array(targets.length).fill(null)
      let next = 0
      const worker = async () => {
        while (next < targets.length) {
          const index = next
          next += 1
          const summary = targets[index]
          if (summary !== undefined) results[index] = await read(summary)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))
      const ids = new Set(summaries.map((s) => s.id))
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id)
      return results.flatMap((r) => (r === null ? [] : [{ ...r, theme: themes.get(r.id) ?? '' }]))
    },
  }
}
