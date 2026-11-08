import { describeError, log } from '../log.js'
import { parseAssignment } from '../shared/assignment.js'
import type { ParagraphListItem, ParagraphSummary } from '../shared/types.js'
import type { ParagraphStore } from './store.js'

/**
 * 一覧に出すテーマ（各 `assignment.md` の `# ` 行）を読む。
 *
 * - **id + rev で覚えておき**、一覧の rev が変わっていなければ読み直さない（一覧を開くたびに全件ダウンロードしないため）
 * - `assignment.md` が無い・0 バイトなら読まずに空
 * - 1 件読めなくても一覧全体は失敗させない（その件は空。warn を出す）
 */

/** 同時に読む件数の上限。 */
export const THEME_READ_CONCURRENCY = 6

export interface ThemeReader {
  withThemes(summaries: ParagraphSummary[]): Promise<ParagraphListItem[]>
}

export function createThemeReader(
  store: Pick<ParagraphStore, 'readStage'>,
  concurrency = THEME_READ_CONCURRENCY,
): ThemeReader {
  /** id → 読んだときの rev とテーマ。 */
  const cache = new Map<string, { rev: string; theme: string }>()

  async function themeOf(summary: ParagraphSummary): Promise<string> {
    const file = summary.files.assignment
    if (file === undefined || file.size === 0) return ''
    const cached = cache.get(summary.id)
    if (cached?.rev === file.rev) return cached.theme
    try {
      const content = await store.readStage(summary.id, 'assignment')
      const theme = parseAssignment(content.text).theme
      // 一覧のあとで保存されていれば読んだ版の rev になる。次の一覧はその rev なので当たる
      if (content.rev !== null) cache.set(summary.id, { rev: content.rev, theme })
      return theme
    } catch (error) {
      log.warn(`${summary.id} のテーマを読めません: ${describeError(error)}`)
      return ''
    }
  }

  async function withThemes(summaries: ParagraphSummary[]): Promise<ParagraphListItem[]> {
    const themes: string[] = new Array(summaries.length).fill('')
    let next = 0
    const worker = async () => {
      while (next < summaries.length) {
        const index = next
        next += 1
        const summary = summaries[index]
        if (summary !== undefined) themes[index] = await themeOf(summary)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, summaries.length) }, worker))
    // 消えたパラグラフの分は捨てる
    const ids = new Set(summaries.map((s) => s.id))
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id)
    return summaries.map((summary, index) => ({ ...summary, theme: themes[index] ?? '' }))
  }

  return { withThemes }
}
