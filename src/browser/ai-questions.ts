import {
  type AiKind,
  type AiQuestion,
  MAX_QUESTION_LENGTH,
  MAX_QUESTIONS,
} from '../shared/ideas.js'
import { askAiQuestion } from './api.js'
import { h, replace } from './dom.js'
import { errorText } from './ui.js'

/**
 * AI案の結果の下の「質問する」欄（`docs/plans/ai-followup-questions.md`）。右ペインの「AI案」の 3 つの欄で使う。
 *
 * - それまでの質問（右寄せ）と答え（左）を並べ、その下に質問の欄。Ctrl+Enter でも送れる
 * - 答えはサーバが保存する。呼び出し中に画面を離れて戻ったときは、このモジュールに持った Promise の終わりを待って描く
 * - `MAX_QUESTIONS` 回で欄を閉じる。AI案を出し直したら空から（サーバもその種類の質問を消している）
 */

export interface QuestionBox {
  el: HTMLElement
  /** 結果を描いたとき（`questions` はそれまでの質問と答え。出し直したら空）。 */
  show(questions: readonly AiQuestion[]): void
  /** AI案を出している間は質問させない。 */
  setLocked(locked: boolean): void
  /** 元の AI案が今のテーマ・アウトラインと合わないとき。 */
  setStale(stale: boolean): void
}

/** 呼び出し中の質問（`<id>/<種類>` → 質問と答えの Promise）。画面を作り直しても残る。 */
const asking = new Map<string, { question: string; promise: Promise<AiQuestion> }>()

function bubble(q: { question: string; answer?: string }): HTMLElement[] {
  return [
    h('p', { class: 'ai-q' }, q.question),
    q.answer === undefined
      ? h('p', { class: 'ai-a pending' }, '答えています…')
      : h('p', { class: 'ai-a' }, q.answer),
  ]
}

export function createQuestionBox(id: string, kind: AiKind): QuestionBox {
  const key = `${id}/${kind}`
  let questions: AiQuestion[] = []
  /** この欄で表示中の、呼び出し中の質問。 */
  let inFlight: { question: string; promise: Promise<AiQuestion> } | null = null
  let locked = false

  const log = h('div', { class: 'ai-qa-log' })
  const stale = h('p', { class: 'ai-stale' })
  const input = h('textarea', {
    class: 'ai-qa-input',
    rows: 2,
    maxlength: MAX_QUESTION_LENGTH,
    placeholder: 'この結果について質問する（日本語で。Ctrl+Enter で送る）',
    'aria-label': 'AI案への質問',
  })
  const button = h('button', { class: 'btn', type: 'button' }, '質問する')
  const message = h('p', { class: 'error ai-error' })
  const limit = h('p', { class: 'muted ai-sub-note' })
  const form = h('div', { class: 'ai-qa-form' }, input, button)
  const el = h('div', { class: 'ai-qa', hidden: true }, log, stale, form, message, limit)

  function paint(): void {
    replace(
      log,
      ...questions.flatMap((q) => bubble(q)),
      ...(inFlight === null ? [] : bubble({ question: inFlight.question })),
    )
    const full = questions.length >= MAX_QUESTIONS
    form.hidden = full
    replace(
      limit,
      full ? `質問は ${MAX_QUESTIONS} 回までです。AI案を出し直すと新しく聞けます。` : '',
    )
    const busy = inFlight !== null
    input.disabled = busy || locked
    button.disabled = busy || locked
    replace(button, busy ? '答えています…' : '質問する')
  }

  async function wait(entry: { question: string; promise: Promise<AiQuestion> }): Promise<void> {
    inFlight = entry
    replace(message)
    paint()
    try {
      const answered = await entry.promise
      // 保存してある分をもう描いていれば重ねない
      if (!questions.some((q) => q.createdAt === answered.createdAt)) questions.push(answered)
    } catch (error) {
      replace(message, `答えを出せませんでした: ${errorText(error)}`)
      // 送れなかった質問は欄に戻す（打ち直さずに済むよう）
      if (input.value === '') input.value = entry.question
    } finally {
      if (inFlight === entry) inFlight = null
      paint()
    }
  }

  function send(): void {
    const question = input.value.trim()
    if (question === '' || inFlight !== null || locked) return
    const entry = { question, promise: askAiQuestion(id, kind, question) }
    asking.set(key, entry)
    const forget = () => {
      if (asking.get(key) === entry) asking.delete(key)
    }
    entry.promise.then(forget, forget)
    input.value = ''
    void wait(entry)
  }

  button.addEventListener('click', send)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      send()
    }
  })

  return {
    el,
    show(saved) {
      questions = [...saved]
      el.hidden = false
      replace(message)
      // 前の画面で送った質問がまだ答えを待っていれば、その続きを出す
      const pendingEntry = asking.get(key)
      if (pendingEntry !== undefined && inFlight === null) void wait(pendingEntry)
      else paint()
    },
    setLocked(value) {
      locked = value
      paint()
    },
    setStale(value) {
      replace(stale, value ? '前のテーマ・アウトラインについての質問になります。' : '')
    },
  }
}
