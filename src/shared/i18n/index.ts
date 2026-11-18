import { en } from './en.js'
import { ja, type Messages } from './ja.js'

/**
 * 画面の言語（英語 / 日本語の UI。`docs/plans/archive/ui-english.md`）。純関数とデータだけで、Node にも DOM にも依存しない。
 * ブラウザの今の言語と保存は `src/browser/i18n.ts`。
 *
 * 訳すのは画面の文字だけ。ユーザーが書いたもの・AI の答え（日本語のまま）・課題の書式は変えない。
 */

export type { Messages } from './ja.js'

export const LANGS = ['en', 'ja'] as const
export type Lang = (typeof LANGS)[number]

/** 初めて開いたとき（覚えていない・読めないとき）の言語（2026-11-17 ユーザーの決定）。 */
export const DEFAULT_LANG: Lang = 'en'

export const MESSAGES: Readonly<Record<Lang, Messages>> = { en, ja }

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/** 覚えていた値から言語を決める（知らない値・無ければ既定）。 */
export function parseLang(value: unknown): Lang {
  return isLang(value) ? value : DEFAULT_LANG
}

/**
 * サーバのエラー（コードと `message`）を画面の文にする。知らないコードはサーバの `message` をそのまま返す。
 * `ai_error` は API の失敗の中身（SDK の英語のメッセージ）を後ろに添える。
 */
export function apiErrorText(messages: Messages, code: string, serverMessage: string): string {
  const codes: Readonly<Record<string, string>> = messages.errors.codes
  if (!Object.hasOwn(codes, code)) return serverMessage
  const text = codes[code] as string
  if (code === 'ai_error' && serverMessage !== '') return `${text} (${serverMessage})`
  return text
}
