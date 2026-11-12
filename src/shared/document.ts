import { titleLine } from './export.js'

/**
 * 提出用の文書の形（.docx と PDF で共通。`docs/plans/archive/docx-pdf-export.md`）。純関数。
 *
 * - 左上に名前・クラス・日付（入れたものだけ）、1 行空けて（2026-11-12。両方あるときだけ）、その下に中央のタイトル（STEP 3 のタイトルの欄。空なら出さない）、本文
 * - **課題のテーマは出さない**（日本語で書くこともあるため。2026-11-12。`docs/plans/archive/draft-title.md`）
 * - 本文は空行で区切った塊を 1 段落とし、段落の中の改行は空白に直す
 */

export interface DocumentInput {
  /** STEP 3 のタイトル（空でもよい）。 */
  title: string
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

/** 頭の行（名前・クラス・日付）とタイトルの間を 1 行空けるか（両方あるときだけ。.docx と PDF で共通）。 */
export function hasTitleGap(doc: SubmissionDocument): boolean {
  return doc.header.length > 0 && doc.title !== ''
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
    title: titleLine(input.title),
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
