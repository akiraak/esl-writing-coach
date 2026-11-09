/**
 * 提出用の文書の形（.docx と PDF で共通。`docs/plans/archive/docx-pdf-export.md`）。純関数。
 *
 * - 左上に名前・クラス・日付（入れたものだけ）、その下にテーマを中央のタイトル、本文
 * - 本文は空行で区切った塊を 1 段落とし、段落の中の改行は空白に直す
 */

export interface DocumentInput {
  theme: string
  draft: string
  name: string
  klass: string
  date: string
}

export interface SubmissionDocument {
  /** 左上の行（名前・クラス・日付のうち入れたもの）。 */
  header: string[]
  title: string
  paragraphs: string[]
}

export function paragraphsOf(draft: string): string[] {
  return draft
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter((block) => block !== '')
}

export function documentOf(input: DocumentInput): SubmissionDocument {
  return {
    header: [input.name, input.klass, input.date].map((s) => s.trim()).filter((s) => s !== ''),
    title: input.theme.trim(),
    paragraphs: paragraphsOf(input.draft),
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `November 8, 2026`（その日のローカルの日付）。 */
export function formatSubmissionDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}
