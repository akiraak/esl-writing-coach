/**
 * 下書きのプレーンテキストの書き出し（`docs/plans/archive/export-plain-text.md`）。純関数。
 *
 * - 末尾の空白・空行は落として改行 1 つで終える。中の改行・字下げはそのまま。空（空白だけ）なら空文字
 * - ファイル名はパラグラフの id（`2026-11-08-school-uniforms.txt`。id は英数字と `-` だけなのでそのまま使える）
 */

export function plainTextOf(text: string): string {
  const trimmed = text.replace(/\s+$/u, '')
  return trimmed.trim() === '' ? '' : `${trimmed}\n`
}

export function exportFileName(id: string): string {
  return `${id}.txt`
}
