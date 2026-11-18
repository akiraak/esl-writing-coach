import { CRITERIA, type Feedback, isFeedbackStale } from '../shared/feedback.js'
import { type AiCard, cardFrame, whenLabels } from './ai-pane.js'
import { readFeedback, scoreParagraph } from './api.js'
import { h, replace } from './dom.js'
import { t } from './i18n.js'
import { errorText, fixLine, formatDate, formatTime } from './ui.js'

/**
 * 編集画面の右ペインの採点のカード（AI の採点と指摘。`docs/plans/archive/ai-scoring.md`）。並べ方は `ai-pane.ts`。
 *
 * - 「採点する」を押したときだけ採点する（自動では走らせない）。押したら手元の未保存を保存し終えてから、
 *   サーバが保存された下書きを読んで採点する
 * - 結果は合計・観点ごとの点数と一言・よかった点・綴りの誤りの一覧（正しい綴りつき）・指摘（観点・引用・ヒント・修正例の英文）
 * - 採点した後に本文を直したら知らせる（もう一度採点できる）
 * - 編集画面を開いている間は 1 つを持ち続ける（段階を移っても、採点中の状態と結果を保つ）
 */

export interface FeedbackPanelOptions {
  id: string
  /** 手元の最新の下書き。 */
  draftText(): string
  /** 手元の最新のタイトル。 */
  titleText(): string
  /**
   * 採点の前に全部の段階を保存し終える。下書きを保存できなかった・競合しているなら、理由の文を返す（採点しない）。
   */
  prepare(): Promise<string | null>
}

export interface FeedbackPanel {
  card: AiCard
  /** 下書きが変わったら（「本文が変わっています」・空なら押せない、を更新する）。 */
  sync(): void
}

export function createFeedbackPanel(options: FeedbackPanelOptions): FeedbackPanel {
  const m = t().feedback
  let feedback: Feedback | null = null
  let configured = true
  let loaded = false
  let busy = false
  let error = ''

  const button = h('button', { class: 'btn pri', type: 'button' }, m.button)
  const note = h('p', { class: 'muted ai-card-desc' })
  const message = h('p', { class: 'error score-error' })
  const stale = h('p', { class: 'score-stale' })
  const result = h('div', { class: 'score-result' })
  /** 結果は長いので、上に出す 2 つ目のとき（STEP 3 では「AI に質問」の下）は畳む（`setFolded`）。 */
  const foldSummary = h('summary', {}, m.summary)
  const fold = h('details', { class: 'ai-fold', open: true, hidden: true }, foldSummary, result)
  const empty = h('p', { class: 'muted ai-sub-note' })
  const when = whenLabels()
  const card: AiCard = {
    el: cardFrame({
      title: t().ai.tools.score,
      when: when.create('head'),
      desc: note,
      button,
      sends: m.sends,
      after: [message, stale, empty, fold],
    }),
    whenLabel: () => when.create('row'),
    setFolded(folded: boolean) {
      fold.open = !folded
    },
  }

  function sync(): void {
    const empty = options.draftText().trim() === ''
    button.disabled = busy || empty || !configured || !loaded
    replace(button, busy ? m.busy : feedback === null ? m.button : m.again)
    replace(
      note,
      !loaded
        ? t().loading
        : !configured
          ? t().ai.noApiKey
          : busy
            ? m.slow
            : empty
              ? m.noDraft
              : m.desc,
    )
    replace(message, error)
    replace(
      stale,
      feedback !== null && isFeedbackStale(feedback, options.draftText(), options.titleText())
        ? m.stale
        : '',
    )
  }

  function renderResult(): void {
    when.set(
      feedback === null || feedback.scoredAt === ''
        ? ''
        : `${formatDate(feedback.scoredAt)} ${formatTime(feedback.scoredAt)}`,
    )
    fold.hidden = feedback === null
    replace(empty, feedback === null && loaded ? m.none : '')
    if (feedback === null) {
      replace(result)
      return
    }
    const fb = feedback
    replace(foldSummary, m.summaryTotal(fb.total))
    replace(
      result,
      h('div', { class: 'score-total' }, h('b', {}, String(fb.total)), h('span', {}, ' / 100')),
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
              h('span', {}, m.criteria[c.key]),
              h('b', {}, `${s.score} / ${c.max}`),
            ),
            h('div', { class: 'crit-bar' }, fill),
            s.comment === '' ? null : h('p', { lang: 'ja' }, s.comment),
          )
        }),
      ),
      fb.strengths.length === 0
        ? null
        : h(
            'div',
            { class: 'score-block' },
            h('h4', {}, m.strengths),
            h('ul', { class: 'strengths', lang: 'ja' }, ...fb.strengths.map((s) => h('li', {}, s))),
          ),
      fb.spellings.length === 0
        ? null
        : h(
            'div',
            { class: 'score-block' },
            h('h4', {}, m.spellings(fb.spellings.length)),
            h(
              'ul',
              { class: 'spellings', lang: 'en' },
              ...fb.spellings.map((s) =>
                h('li', {}, h('del', {}, s.wrong), h('span', {}, '→'), h('ins', {}, s.right)),
              ),
            ),
          ),
      h(
        'div',
        { class: 'score-block' },
        h('h4', {}, m.findings(fb.findings.length)),
        fb.findings.length === 0
          ? h('p', { class: 'muted' }, m.noFindings)
          : h(
              'ol',
              { class: 'findings' },
              ...fb.findings.map((f) =>
                h(
                  'li',
                  {},
                  h('span', { class: `crit-tag t-${f.criterion}` }, m.criteria[f.criterion]),
                  f.quote === '' ? null : h('q', { lang: 'en' }, f.quote),
                  h('p', { lang: 'ja' }, f.hint),
                  fixLine(f.fix),
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
        // 押して出した結果は、畳んであっても開いて見せる
        fold.open = true
      }
    } catch (e) {
      error = m.failed(errorText(e))
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
      error = m.loadFailed(errorText(e))
      renderResult()
      sync()
    },
  )

  renderResult()
  sync()
  return { card, sync }
}
