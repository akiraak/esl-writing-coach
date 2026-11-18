import { type Lang, MESSAGES, type Messages, parseLang } from '../shared/i18n/index.js'

/**
 * ブラウザの今の表示の言語（`docs/plans/archive/ui-english.md`）。言語はブラウザ（`localStorage`）に覚え、読めなければ既定（英語）。
 *
 * 部品は描くときに `t()` で今の言語の文を引く。言語を変えたら画面を作り直す（`main.ts` の `onLangRequest`）ので、
 * 描いたあとの文を差し替える仕組みは持たない。
 */

const LANG_KEY = 'esl-writing.lang'

function loadLang(): Lang {
  try {
    return parseLang(localStorage.getItem(LANG_KEY))
  } catch {
    return parseLang(null)
  }
}

let lang: Lang = loadLang()
document.documentElement.lang = lang

export function getLang(): Lang {
  return lang
}

/** 今の言語の文。 */
export function t(): Messages {
  return MESSAGES[lang]
}

/** 言語を変えて覚える（画面は作り直さない。作り直すのは呼び出し側）。 */
export function setLang(next: Lang): void {
  lang = next
  document.documentElement.lang = next
  try {
    localStorage.setItem(LANG_KEY, next)
  } catch {
    // 覚えられなくても、この画面を開いている間は切り替わる
  }
}

let requestHandler: (next: Lang) => void = setLang

/** ヘッダの切り替えが押されたとき。`main.ts` が保存を待って画面を作り直す処理を渡す。 */
export function onLangRequest(handler: (next: Lang) => void): void {
  requestHandler = handler
}

export function requestLang(next: Lang): void {
  if (next !== lang) requestHandler(next)
}
