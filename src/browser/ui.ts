import type { Stage } from '../shared/types.js'
import { h } from './dom.js'

/** 画面の共通部品と表示用の言葉。 */

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  assignment: '課題',
  ideas: 'アイデア',
  outline: 'アウトライン',
  draft: '下書き・推敲',
}

/** 一覧のカードの進み具合に添える短い名前（幅が狭いので）。 */
export const STAGE_SHORT_LABELS: Readonly<Record<Stage, string>> = {
  ...STAGE_LABELS,
  draft: '下書き',
}

/** 段階ごとの言語（`CLAUDE.md` の「書く流れ」）。下書きだけ英語のみ。 */
export const STAGE_LANG: Readonly<Record<Stage, 'ja' | 'en'>> = {
  assignment: 'ja',
  ideas: 'ja',
  outline: 'ja',
  draft: 'en',
}

export function logo(): HTMLElement {
  return h(
    'a',
    { class: 'logo', href: '#/' },
    h('i', {}, h('b'), h('b'), h('b'), h('b')),
    'ESL Writing',
  )
}

/** ヘッダ。`middle` はロゴの右（パンくず）、`right` は学習ガイドの左（保存の状態など）。 */
export function header(
  middle: (Node | string)[] = [],
  right: (Node | string)[] = [],
  /** 学習ガイド画面では右端を「パラグラフ一覧へ」にする（モックと同じ）。 */
  onGuide = false,
): HTMLElement {
  return h(
    'header',
    { class: 'top' },
    logo(),
    ...middle,
    h('span', { class: 'sp' }),
    ...right,
    onGuide
      ? h('a', { class: 'btn', href: '#/' }, 'パラグラフ一覧へ')
      : h('a', { class: 'btn', href: '#/guide' }, '学習ガイド'),
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD`（ブラウザのローカル時刻）。 */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `HH:MM`（ブラウザのローカル時刻）。 */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorBox(error: unknown): HTMLElement {
  return h('p', { class: 'error' }, `読み込めません: ${errorText(error)}`)
}
