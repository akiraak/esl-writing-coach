import { type AiQuestion, MAX_DRAFT_QUESTIONS } from '../shared/ideas.js'
import { type AiCard, cardFrame, whenLabels } from './ai-pane.js'
import { createQuestionBoxWith } from './ai-questions.js'
import { askDraftQuestion, clearDraftQuestions, readAiResults } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatDate, formatTime } from './ui.js'

/**
 * 編集画面の右ペインの「AI に質問」のカード（`docs/plans/archive/draft-chat.md`）。STEP 3 でいちばん上に出る。並べ方は `ai-pane.ts`。
 *
 * - 下書きを書いている途中に、語・文法・表現・自分の下書き・書き方について自由に聞ける。
 *   **この欄の答えだけは英文（直した文・例文）も出る**（AI案とその質問は直した文を出さない。採点は修正例を出す）
 * - 送る前に手元の未保存を保存し終え、サーバが保存されている下書きと課題を読んで答える（採点と同じ）。下書きが空でも聞ける
 * - やりとりはサーバがパラグラフごとに残す。続けて聞ける（前のやりとりも送る）。`MAX_DRAFT_QUESTIONS` 回まで。
 *   「はじめから」で消して聞き直せる
 * - 質問の欄は AI案への質問と同じ部品（`ai-questions.ts`。呼び出し中に画面を離れて戻っても続きから出る）
 */

export interface DraftChatPanelOptions {
  id: string
  /** 送る前に全部の段階を保存し終える。下書きを保存できなかった・競合しているなら、理由の文を返す（送らない）。 */
  prepare(): Promise<string | null>
}

export function createDraftChatPanel(options: DraftChatPanelOptions): { card: AiCard } {
  const { id } = options
  let count = 0
  let busy = false
  let clearing = false

  const when = whenLabels()
  const message = h('p', { class: 'error ai-error' })
  const reset = h('button', { class: 'ai-chat-reset', type: 'button' }, 'はじめから')
  const resetRow = h(
    'div',
    { class: 'ai-chat-foot', hidden: true },
    h('span', { class: 'muted' }),
    reset,
  )

  function syncReset(): void {
    resetRow.hidden = count === 0
    reset.disabled = busy || clearing
    replace(
      resetRow.firstElementChild as HTMLElement,
      `${count} / ${MAX_DRAFT_QUESTIONS} 回（前のやりとりも送ります）`,
    )
  }

  const box = createQuestionBoxWith({
    key: `${id}/draft-chat`,
    async ask(question) {
      const reason = await options.prepare()
      if (reason !== null) throw new Error(reason)
      return askDraftQuestion(id, question)
    },
    max: MAX_DRAFT_QUESTIONS,
    placeholder: '英語や下書きについて質問（Ctrl+Enter で送る）',
    ariaLabel: 'AI に質問',
    fullNote: `質問は ${MAX_DRAFT_QUESTIONS} 回までです。「はじめから」で消すと新しく聞けます。`,
    onChange(questions: readonly AiQuestion[], asking: boolean) {
      count = questions.length
      busy = asking
      const last = questions.at(-1)
      when.set(
        last === undefined ? '' : `${formatDate(last.createdAt)} ${formatTime(last.createdAt)}`,
      )
      syncReset()
    },
  })
  box.el.classList.add('ai-chat')

  reset.addEventListener('click', async () => {
    if (busy || clearing || count === 0) return
    if (!window.confirm('「AI に質問」のやりとりを全部消して、はじめから聞き直しますか？')) return
    clearing = true
    replace(message)
    syncReset()
    try {
      await clearDraftQuestions(id)
      box.show([])
    } catch (error) {
      replace(message, `消せませんでした: ${errorText(error)}`)
    } finally {
      clearing = false
      syncReset()
    }
  })

  // 読み込めるまでは送らせない（前のやりとりを知らずに聞き始めないため）
  box.setLocked(true)
  box.show([])
  readAiResults(id).then(
    (saved) => {
      box.setLocked(false)
      box.show(saved.draftQuestions ?? [])
    },
    (error: unknown) => {
      box.setLocked(false)
      replace(message, `前のやりとりを読めません: ${errorText(error)}`)
    },
  )

  return {
    card: {
      el: cardFrame({
        title: 'AI に質問',
        when: when.create('head'),
        desc: h(
          'p',
          { class: 'muted ai-card-desc' },
          '語・文法・表現の違い、下書きのこの文は合っているか、書き方など、自由に聞けます。答えには英文（直した文・例文）も出ます。',
        ),
        sends: '下書き・タイトル・課題・語数と文数・質問',
        after: [box.el, message, resetRow],
      }),
      whenLabel: () => when.create('row'),
    },
  }
}
