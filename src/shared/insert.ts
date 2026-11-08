/**
 * 表現集の表現を本文に入れるときの、前後の空白の足し方（`docs/plans/archive/insert-phrase.md`）。純関数。
 *
 * - 前の文字が空白・改行・本文の先頭でなければ、前に空白を 1 つ足す
 * - 後ろの文字が空白・改行でなければ（本文の終わりも含む）、後ろに空白を 1 つ足す（続けて打てるように）
 */

export function phraseToInsert(text: string, start: number, end: number, phrase: string): string {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const trail = /^\s/.test(after) ? '' : ' '
  return `${lead}${phrase}${trail}`
}
