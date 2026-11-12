/**
 * 下書きのプレーンテキストの書き出し（`docs/plans/archive/export-plain-text.md`）。純関数。
 *
 * - 末尾の空白・空行は落として改行 1 つで終える。中の改行・字下げはそのまま。空（空白だけ）なら空文字
 * - タイトル（STEP 3 のタイトルの欄。`docs/plans/archive/draft-title.md`）があれば、1 行目にタイトル、空行を 1 つ、そのあとに本文。
 *   本文が空ならタイトルがあっても空文字。課題のテーマは出さない
 * - ファイル名はパラグラフの id（`2026-11-08-school-uniforms.txt`。id は英数字と `-` だけなのでそのまま使える）
 */

export function plainTextOf(text: string, title = ''): string {
  const trimmed = text.replace(/\s+$/u, '')
  if (trimmed.trim() === '') return ''
  const head = titleLine(title)
  return head === '' ? `${trimmed}\n` : `${head}\n\n${trimmed}\n`
}

/** タイトルを 1 行にする（前後の空白を落とし、中の改行は空白に直す）。 */
export function titleLine(title: string): string {
  return title.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

export function exportFileName(id: string): string {
  return `${id}.txt`
}
