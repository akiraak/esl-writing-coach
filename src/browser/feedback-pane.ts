import { CRITERIA, criterionOf, type Feedback } from '../shared/feedback.js'
import { readFeedback, scoreParagraph } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatDate, formatTime } from './ui.js'

/**
 * 編集画面の右ペインの「採点」タブ（AI の採点と指摘。`docs/plans/archive/ai-scoring.md`）。
 *
 * - 「採点する」を押したときだけ採点する（自動では走らせない）。押したら手元の未保存を保存し終えてから、
 *   サーバが保存された下書きを読んで採点する
 * - 結果は合計・観点ごとの点数と一言・よかった点・指摘（観点・引用・ヒント）。直した文は出ない
 * - 採点した後に本文を直したら知らせる（もう一度採点できる）
 * - 編集画面を開いている間は 1 つを持ち続ける（段階やタブを移っても、採点中の状態と結果を保つ）
 */

export interface FeedbackPanelOptions {
  id: string
  /** 手元の最新の下書き。 */
  draftText(): string
  /**
   * 採点の前に全部の段階を保存し終える。下書きを保存できなかった・競合しているなら、理由の文を返す（採点しない）。
   */
  prepare(): Promise<string | null>
}

export interface FeedbackPanel {
  el: HTMLElement
  /** 下書きが変わったら（「本文が変わっています」・空なら押せない、を更新する）。 */
  sync(): void
}

export function createFeedbackPanel(options: FeedbackPanelOptions): FeedbackPanel {
  let feedback: Feedback | null = null
  let configured = true
  let loaded = false
  let busy = false
  let error = ''

  const button = h('button', { class: 'btn pri score-btn', type: 'button' }, '採点する')
  const note = h('p', { class: 'muted score-note' })
  const message = h('p', { class: 'error score-error' })
  const stale = h('p', { class: 'score-stale' })
  const result = h('div', { class: 'score-result' })
  const el = h(
    'div',
    { class: 'feedback-panel' },
    h('div', { class: 'score-head' }, button, note),
    message,
    stale,
    result,
  )

  function sync(): void {
    const empty = options.draftText().trim() === ''
    button.disabled = busy || empty || !configured || !loaded
    replace(button, busy ? '採点中…' : feedback === null ? '採点する' : 'もう一度採点する')
    replace(
      note,
      !loaded
        ? '読み込み中…'
        : !configured
          ? 'ANTHROPIC_API_KEY が設定されていません。.env に入れてサーバを起動し直すと使えます。'
          : busy
            ? '30 秒〜1 分ほどかかります。'
            : empty
              ? '下書きを書くと採点できます。'
              : '押すと、下書きと課題の条件を Anthropic の API に送って採点します。直した文は出さず、ヒントだけを出します。',
    )
    replace(message, error)
    replace(
      stale,
      feedback !== null && feedback.draft.trim() !== options.draftText().trim()
        ? '採点した後に本文が変わっています。直したらもう一度採点できます。'
        : '',
    )
  }

  function renderResult(): void {
    if (feedback === null) {
      replace(result, loaded ? h('p', { class: 'muted' }, 'まだ採点していません。') : null)
      return
    }
    const fb = feedback
    replace(
      result,
      h(
        'div',
        { class: 'score-total' },
        h('b', {}, String(fb.total)),
        h('span', {}, ' / 100'),
        h(
          'small',
          {},
          fb.scoredAt === '' ? '' : `採点 ${formatDate(fb.scoredAt)} ${formatTime(fb.scoredAt)}`,
        ),
      ),
      h(
        'div',
        { class: 'score-criteria' },
        ...CRITERIA.map((c) => {
          const s = fb.scores[c.key]
          const fill = h('i')
          fill.style.width = `${(s.score / c.max) * 100}%`
          return h(
            'div',
            { class: 'crit' },
            h(
              'div',
              { class: 'crit-head' },
              h('span', {}, c.label),
              h('b', {}, `${s.score} / ${c.max}`),
            ),
            h('div', { class: 'crit-bar' }, fill),
            s.comment === '' ? null : h('p', {}, s.comment),
          )
        }),
      ),
      fb.strengths.length === 0
        ? null
        : h(
            'div',
            { class: 'score-block' },
            h('h4', {}, 'よかった点'),
            h('ul', { class: 'strengths' }, ...fb.strengths.map((s) => h('li', {}, s))),
          ),
      h(
        'div',
        { class: 'score-block' },
        h('h4', {}, `直すところ（${fb.findings.length}）`),
        fb.findings.length === 0
          ? h('p', { class: 'muted' }, '大きな指摘はありません。')
          : h(
              'ol',
              { class: 'findings' },
              ...fb.findings.map((f) =>
                h(
                  'li',
                  {},
                  h('span', { class: `crit-tag t-${f.criterion}` }, criterionOf(f.criterion).label),
                  f.quote === '' ? null : h('q', { lang: 'en' }, f.quote),
                  h('p', {}, f.hint),
                ),
              ),
            ),
      ),
    )
  }

  button.addEventListener('click', async () => {
    if (busy) return
    busy = true
    error = ''
    sync()
    try {
      const reason = await options.prepare()
      if (reason !== null) {
        error = reason
      } else {
        feedback = await scoreParagraph(options.id)
        renderResult()
      }
    } catch (e) {
      error = `採点できませんでした: ${errorText(e)}`
    } finally {
      busy = false
      sync()
    }
  })

  readFeedback(options.id).then(
    (state) => {
      feedback = state.feedback
      configured = state.aiConfigured
      loaded = true
      renderResult()
      sync()
    },
    (e: unknown) => {
      loaded = true
      error = `採点の結果を読めません: ${errorText(e)}`
      renderResult()
      sync()
    },
  )

  renderResult()
  sync()
  return { el, sync }
}
