/**
 * `assignment.md`（課題: テーマ・語数／文数の指定・構成や表現の条件）の読み書き。純関数。
 * サーバ（新規作成でテーマを書く）とブラウザ（課題の画面・一覧・下書きのメーター）の両方から使う。
 *
 * ```markdown
 * # Should students wear school uniforms?
 *
 * - 語数: 120-150
 * - 文数: 8-10
 *
 * ## 条件
 *
 * 理由を 3 つ挙げ、First / Second / Finally を使う。
 * ```
 *
 * - 指定は「下限〜上限（片方だけも可）」: `120-150`・`120-`（以上）・`-150`（以下）・`120`（ちょうど）・空（指定なし）
 * - Dropbox やほかのエディタで手で直されても**内容を消さない**: 読み取れなかった行は条件の先頭に回す
 */

export interface CountRange {
  /** 下限（無ければ null）。 */
  min: number | null
  /** 上限（無ければ null）。 */
  max: number | null
}

export interface Assignment {
  theme: string
  words: CountRange
  sentences: CountRange
  /** 構成や表現の条件（日本語可・複数行）。 */
  conditions: string
}

export const EMPTY_RANGE: CountRange = { min: null, max: null }

export function emptyAssignment(theme = ''): Assignment {
  return { theme, words: { ...EMPTY_RANGE }, sentences: { ...EMPTY_RANGE }, conditions: '' }
}

const THEME_LINE = /^#(?:[ \t]+(.*))?$/
const WORDS_LINE = /^\s*[-*・]\s*語数\s*[:：]\s*(.*)$/
const SENTENCES_LINE = /^\s*[-*・]\s*文数\s*[:：]\s*(.*)$/
const CONDITIONS_HEADING = /^##\s*条件\s*$/

/** 全角の数字・ハイフン類・波ダッシュを半角に寄せる。 */
function normalizeRangeText(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[〜～~–—−－‐]/g, '-')
    .replace(/\s+/g, '')
}

/**
 * 指定の文字列を読む。読めなければ null（呼び出し側はその行を条件に回す）。
 * 「語」「文」「words」などの単位が付いていても読む。
 */
export function parseRange(raw: string): CountRange | null {
  const text = normalizeRangeText(raw).replace(/(語|文|words?|sentences?)$/i, '')
  if (text === '') return { ...EMPTY_RANGE }
  let m = /^(\d+)-(\d+)?$/.exec(text)
  if (m !== null) return { min: Number(m[1]), max: m[2] === undefined ? null : Number(m[2]) }
  m = /^-(\d+)$/.exec(text)
  if (m !== null) return { min: null, max: Number(m[1]) }
  m = /^(\d+)$/.exec(text)
  if (m !== null) return { min: Number(m[1]), max: Number(m[1]) }
  return null
}

/** 指定を書き出す（`parseRange` と往復する）。 */
export function formatRange(range: CountRange): string {
  const { min, max } = range
  if (min === null && max === null) return ''
  if (min !== null && max !== null) return min === max ? `${min}` : `${min}-${max}`
  return min !== null ? `${min}-` : `-${max}`
}

/** 先頭と末尾の空行を落とす（行の中の空白は残す）。 */
function trimBlankLines(lines: string[]): string {
  let start = 0
  let end = lines.length
  while (start < end && lines[start]?.trim() === '') start += 1
  while (end > start && lines[end - 1]?.trim() === '') end -= 1
  return lines.slice(start, end).join('\n')
}

export function parseAssignment(text: string): Assignment {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const result = emptyAssignment()
  const leftovers: string[] = []
  let themeFound = false
  let index = 0

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (CONDITIONS_HEADING.test(line)) {
      index += 1
      break
    }
    const theme = THEME_LINE.exec(line)
    if (theme !== null && !themeFound) {
      result.theme = (theme[1] ?? '').trim()
      themeFound = true
      continue
    }
    const words = WORDS_LINE.exec(line)
    const wordsRange = words === null ? null : parseRange(words[1] ?? '')
    if (wordsRange !== null) {
      result.words = wordsRange
      continue
    }
    const sentences = SENTENCES_LINE.exec(line)
    const sentencesRange = sentences === null ? null : parseRange(sentences[1] ?? '')
    if (sentencesRange !== null) {
      result.sentences = sentencesRange
      continue
    }
    if (line.trim() !== '') leftovers.push(line)
  }

  const conditions = trimBlankLines(lines.slice(index))
  // 読み取れなかった行は消さずに条件の先頭へ（保存し直しても失われないように）
  result.conditions = [leftovers.join('\n'), conditions].filter((part) => part !== '').join('\n\n')
  return result
}

export function serializeAssignment(assignment: Assignment): string {
  const theme = assignment.theme.replace(/\s*\n\s*/g, ' ').trim()
  const words = formatRange(assignment.words)
  const sentences = formatRange(assignment.sentences)
  const conditions = trimBlankLines(assignment.conditions.replaceAll('\r\n', '\n').split('\n'))
  const lines = [
    theme === '' ? '#' : `# ${theme}`,
    '',
    words === '' ? '- 語数:' : `- 語数: ${words}`,
    sentences === '' ? '- 文数:' : `- 文数: ${sentences}`,
    '',
    '## 条件',
    '',
  ]
  if (conditions !== '') lines.push(conditions, '')
  return lines.join('\n')
}

/** 下限が上限より大きい（画面で注意を出す。保存は止めない）。 */
export function isReversed(range: CountRange): boolean {
  return range.min !== null && range.max !== null && range.min > range.max
}
