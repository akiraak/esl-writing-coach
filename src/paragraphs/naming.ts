/**
 * パラグラフのフォルダ名（= パラグラフの id）を作る・確かめる（純関数）。
 *
 * フォルダ名は「作成日 + テーマ」（`CLAUDE.md` の「ファイルの配置」）。例: `2026-11-08-should-students-wear-school-uniforms`。
 * **id として使うだけ**で、テーマを後から変えても id は変えない（テーマの正は課題の本文）。
 */

/** スラッグの長さの上限（単語の切れ目で切る）。 */
export const SLUG_MAX_LENGTH = 40

/** テーマに英数字が無いときのスラッグ（日本語だけのテーマなど）。 */
export const FALLBACK_SLUG = 'paragraph'

/**
 * API から来た id として受け付ける形。日付 + 小文字の英数字とハイフンだけ。
 * `..`・`/`・`\`・大文字（Dropbox の頃に大文字小文字を区別しなかったため）を入れさせない。
 */
const ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** 実在する日付か（`2026-02-30` を弾く）。 */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** `YYYY-MM-DD` の実在する日付か。 */
export function isDateString(value: string): boolean {
  const m = DATE_PATTERN.exec(value)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** パラグラフの id として正しい形か。 */
export function isParagraphId(value: string): boolean {
  const m = ID_PATTERN.exec(value)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** id の先頭の作成日（`YYYY-MM-DD`）。id の形でなければ null。 */
export function dateOfParagraphId(id: string): string | null {
  return isParagraphId(id) ? id.slice(0, 10) : null
}

/**
 * テーマからスラッグを作る。小文字にして、英数字以外の並びを `-` 1 つにする。
 * アクセント付きの字は素の字に直す（`café` → `cafe`）。長ければ単語の切れ目で切る。
 */
export function slugFromTheme(theme: string): string {
  const words = theme
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
  let slug = ''
  for (const word of words) {
    const next = slug === '' ? word : `${slug}-${word}`
    if (next.length > SLUG_MAX_LENGTH) {
      // 1 語目から長すぎるときだけ、語の途中で切る
      if (slug === '') slug = word.slice(0, SLUG_MAX_LENGTH)
      break
    }
    slug = next
  }
  return slug === '' ? FALLBACK_SLUG : slug
}

/** 作成日とテーマからフォルダ名の候補を作る。`attempt` が 2 以上なら `-2`, `-3` … を付ける。 */
export function paragraphIdCandidate(date: string, theme: string, attempt = 1): string {
  if (!isDateString(date)) throw new RangeError(`作成日が YYYY-MM-DD ではありません: ${date}`)
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new RangeError(`attempt が不正です: ${attempt}`)
  const base = `${date}-${slugFromTheme(theme)}`
  return attempt === 1 ? base : `${base}-${attempt}`
}
