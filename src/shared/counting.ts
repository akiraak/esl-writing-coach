/**
 * 下書き（英語）の語数・文数の数え方（`docs/plans/archive/draft-editor.md`）。純関数。
 *
 * - 語: 英字・数字のひと続き。`don't`・`well-known`・`3.5` のように、間の `'`・`’`・`-`・`.` でつながったものは 1 語。
 *   `50,000` のような数字の 3 桁区切りも 1 語
 * - 文: `.`・`!`・`?`（続く引用符・括弧も含む）のあとに空白か本文の終わりが来たら文の終わり。
 *   敬称（`Mr.` など）は終わりにしない。`etc.`・`e.g.` などは次が大文字か本文の終わりのときだけ終わり。
 *   最後に句点の無い文があれば 1 文と数える。文字（英字・数字）を含まない切れ端は数えない
 */

const WORD = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+|(?<=\d),\d{3}(?!\d))*/gu

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

/** 後ろに `.` が来ても文の終わりにしない語（敬称など）。小文字・末尾の `.` を除いた形。 */
const NEVER_END = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'mt'])
/** 次が大文字か本文の終わりのときだけ文の終わりにする語。 */
const MAYBE_END = new Set(['etc', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'approx'])

const TERMINATOR = /[.!?]+["'”’)\]]*(?=\s|$)/gu
const HAS_WORD = /[\p{L}\p{N}]/u

export function countSentences(text: string): number {
  return splitSentences(text).length
}

/** 文に分ける（切り方は上の文数の数え方と同じ。前後の空白は落とす）。日本語訳で文ごとに並べるのにも使う。 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = []
  const push = (piece: string) => {
    if (HAS_WORD.test(piece)) sentences.push(piece.trim())
  }
  let start = 0
  for (const match of text.matchAll(TERMINATOR)) {
    const at = match.index ?? 0
    const end = at + match[0].length
    if (match[0].startsWith('.') && !match[0].startsWith('..')) {
      const before = /([\p{L}.]+)$/u.exec(text.slice(start, at))?.[1] ?? ''
      const word = before.toLowerCase().replace(/\.+$/, '')
      if (NEVER_END.has(word)) continue
      if (MAYBE_END.has(word)) {
        const next = /\S/u.exec(text.slice(end))?.[0]
        if (next !== undefined && next === next.toLowerCase()) continue
      }
    }
    push(text.slice(start, end))
    start = end
  }
  push(text.slice(start))
  return sentences
}

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u

/** 日本語（ひらがな・カタカナ・漢字）が混じっているか。 */
export function hasJapanese(text: string): boolean {
  return JAPANESE.test(text)
}
