import { apiErrorText, LANGS, type Lang } from '../shared/i18n/index.js'
import type { Stage } from '../shared/types.js'
import { ApiError } from './api.js'
import { h } from './dom.js'
import { getLang, requestLang, t } from './i18n.js'

/** 画面の共通部品と表示用の言葉（文は `t()`。`src/shared/i18n/`）。 */

/** 段階の名前（今の言語）。 */
export function stageLabel(stage: Stage): string {
  return t().stages[stage]
}

/** 一覧のカードの進み具合に添える短い名前（幅が狭いので）。 */
export function stageShortLabel(stage: Stage): string {
  return t().stagesShort[stage]
}

/** 段階ごとの言語（`CLAUDE.md` の「書く流れ」）。下書きだけ英語のみ。 */
export const STAGE_LANG: Readonly<Record<Stage, 'ja' | 'en'>> = {
  assignment: 'ja',
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

/**
 * ヘッダの右端。既定は学習ガイド画面へのリンク。学習ガイド画面では「パラグラフ一覧へ」（モックと同じ）、
 * 編集画面では学習ガイドの引き出しを開け閉めするボタン（`guide-pane.ts`）を渡す。
 */
export type HeaderEnd = 'guide' | 'list' | HTMLElement

/** ヘッダ。`middle` はロゴの右（パンくず）、`right` は振り返りの左（保存の状態など）。 */
export function header(
  middle: (Node | string)[] = [],
  right: (Node | string)[] = [],
  end: HeaderEnd = 'guide',
): HTMLElement {
  return h(
    'header',
    { class: 'top' },
    logo(),
    ...middle,
    h('span', { class: 'sp' }),
    ...right,
    h('a', { class: 'btn', href: '#/review' }, t().header.review),
    end === 'guide'
      ? h('a', { class: 'btn', href: '#/guide' }, t().header.guide)
      : end === 'list'
        ? h('a', { class: 'btn', href: '#/' }, t().header.toList)
        : end,
    langSwitch(),
  )
}

/** 切り替えのボタンの文字（どちらの言語のときも、その言語自身の名前で出す）。 */
const LANG_NAMES: Readonly<Record<Lang, string>> = { en: 'EN', ja: '日本語' }

/** ヘッダの右端の `EN | 日本語`。押すと `main.ts` が保存を待って画面を作り直す。 */
function langSwitch(): HTMLElement {
  const current = getLang()
  return h(
    'div',
    { class: 'lang-switch', role: 'group', 'aria-label': t().lang.group },
    ...LANGS.map((lang) =>
      h(
        'button',
        {
          type: 'button',
          lang,
          class: lang === current ? 'on' : '',
          'aria-pressed': lang === current ? 'true' : 'false',
          onclick: () => requestLang(lang),
        },
        LANG_NAMES[lang],
      ),
    ),
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

/** エラーの文。サーバのエラーはコードから今の言語の文にする（`apiErrorText`）。 */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return apiErrorText(t(), error.code, error.message)
  return error instanceof Error ? error.message : String(error)
}

export function errorBox(error: unknown): HTMLElement {
  return h('p', { class: 'error' }, t().errors.loadFailed(errorText(error)))
}

/** 採点の指摘の修正例の英文（採点のカードと振り返りで共用）。無ければ出さない。 */
export function fixLine(fix: string): HTMLElement | null {
  return fix === ''
    ? null
    : h('div', { class: 'fix', lang: 'en' }, h('span', { lang: getLang() }, t().feedback.fix), fix)
}
