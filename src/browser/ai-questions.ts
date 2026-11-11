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
 * AI案の結果の下の「質問する」欄（`docs/plans/archive/ai-followup-questions.md`）。右ペインの「AI案」の 3 つの欄で使う。
 *
 * - 最新の質問（右寄せ）と答え（左）を 1 往復だけ出し、それより前は「前の質問（n）」に畳む（開いた状態は保つ）。
 *   その下に質問の欄。Ctrl+Enter でも送れる
 * - 答えはサーバが保存する。呼び出し中に画面を離れて戻ったときは、このモジュールに持った Promise の終わりを待って描く
 * - `MAX_QUESTIONS` 回で欄を閉じる。AI案を出し直したら空から（サーバもその種類の質問を消している）
 * - STEP 3 の「AI に質問」（`draft-chat-pane.ts`）も同じ欄を使う。送り先・回数の上限・文言を `createQuestionBoxWith` で差し替える
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

/** 質問の欄の差し替えられるところ。 */
export interface QuestionBoxOptions {
  /** 呼び出し中の質問を覚える鍵（画面を作り直しても続きから出すため。欄ごとに違うもの）。 */
  key: string
  /** 質問を送って、保存された質問と答えを返す。 */
  ask(question: string): Promise<AiQuestion>
  /** 聞ける回数。 */
  max: number
  placeholder: string
  ariaLabel: string
  /** 回数の上限に達したときの知らせ。 */
  fullNote: string
  /** やりとり・呼び出し中かどうかが変わったとき（`show` のときも）。 */
  onChange?(questions: readonly AiQuestion[], busy: boolean): void
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

/** AI案（テーマの候補・理由と例の候補・アウトラインの指摘）の結果への質問の欄。 */
export function createQuestionBox(id: string, kind: AiKind): QuestionBox {
  return createQuestionBoxWith({
    key: `${id}/${kind}`,
    ask: (question) => askAiQuestion(id, kind, question),
    max: MAX_QUESTIONS,
    placeholder: 'この結果について質問する（日本語で。Ctrl+Enter で送る）',
    ariaLabel: 'AI案への質問',
    fullNote: `質問は ${MAX_QUESTIONS} 回までです。AI案を出し直すと新しく聞けます。`,
  })
}

export function createQuestionBoxWith(options: QuestionBoxOptions): QuestionBox {
  const { key } = options
  let questions: AiQuestion[] = []
  /** この欄で表示中の、呼び出し中の質問。 */
  let inFlight: { question: string; promise: Promise<AiQuestion> } | null = null
  let locked = false

  const log = h('div', { class: 'ai-qa-log' })
  /** 最新より前のやりとり（開け閉めの状態を保つよう作り置く）。 */
  const olderSummary = h('summary', {})
  const olderBox = h('div', { class: 'ai-qa-log' })
  const older = h('details', { class: 'ai-qa-older' }, olderSummary, olderBox)
  const stale = h('p', { class: 'ai-stale' })
  const input = h('textarea', {
    class: 'ai-qa-input',
    rows: 2,
    maxlength: MAX_QUESTION_LENGTH,
    placeholder: options.placeholder,
    'aria-label': options.ariaLabel,
  })
  const button = h('button', { class: 'btn', type: 'button' }, '質問する')
  const message = h('p', { class: 'error ai-error' })
  const limit = h('p', { class: 'muted ai-sub-note' })
  const form = h('div', { class: 'ai-qa-form' }, input, button)
  const el = h('div', { class: 'ai-qa', hidden: true }, log, stale, form, message, limit)

  function paint(): void {
    const entries: { question: string; answer?: string }[] = [
      ...questions,
      ...(inFlight === null ? [] : [{ question: inFlight.question }]),
    ]
    const latest = entries.at(-1)
    const before = entries.slice(0, -1)
    replace(olderSummary, `前の質問（${before.length}）`)
    replace(olderBox, ...before.flatMap((q) => bubble(q)))
    replace(
      log,
      before.length === 0 ? null : older,
      ...(latest === undefined ? [] : bubble(latest)),
    )
    const full = questions.length >= options.max
    form.hidden = full
    replace(limit, full ? options.fullNote : '')
    const busy = inFlight !== null
    input.disabled = busy || locked
    button.disabled = busy || locked
    replace(button, busy ? '答えています…' : '質問する')
    options.onChange?.(questions, busy)
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
    const entry = { question, promise: options.ask(question) }
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
