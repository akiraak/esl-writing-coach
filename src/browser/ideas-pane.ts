import type { Assignment } from '../shared/assignment.js'
import {
  type AiKind,
  type AiQuestion,
  isIdeasStale,
  isOutlineReviewStale,
  type SavedIdeas,
  type SavedOutlineReview,
  type SavedThemes,
  STANCE_LABEL,
} from '../shared/ideas.js'
import { createQuestionBox } from './ai-questions.js'
import { readAiResults, reviewOutline, suggestIdeas, suggestThemes } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatDate, formatTime } from './ui.js'

/**
 * 編集画面の右ペインの「AI 案」タブ（AI のアイデア出し。`docs/plans/archive/ai-ideas.md`）。
 *
 * - **テーマの候補**: 分野・キーワード（任意）から、英語の問いと日本語訳。「課題のテーマにする」を押したときだけテーマを書き換える
 * - **理由・例の候補**: 課題のテーマ（手元の最新）から、賛成・反対それぞれの理由と例（日本語）。**見るだけ**
 *   （書き足す先のメモをなくした。見ながら自分でアウトラインに足す。`docs/plans/archive/ideas-outline.md`）
 * - **アウトラインの指摘**: 課題のテーマと条件・アウトラインから、構成の問題を日本語のヒントで（直した項目は出さない）
 * - どれもボタンを押したときだけ呼ぶ。**結果はサーバがパラグラフごとに DB に保存する**ので、画面を移っても・開き直しても残る
 *   （開いたら `readAiResults` で描き直す。`docs/plans/archive/sqlite-storage.md`）。出したときの入力と今が違えば知らせる
 * - 呼び出し中に画面を離れて戻ったときは、続きの「考えています…」を出して終わったら描く（呼び出し中の Promise は
 *   このモジュールにパラグラフごとに持つ。結果はサーバが保存するので、戻らなくても失われない）
 * - 各結果の下に「質問する」欄（`ai-questions.ts`。`docs/plans/ai-followup-questions.md`）。出し直すと質問は消える
 */

export interface IdeasPanelOptions {
  /** パラグラフの id（AI案の保存先）。 */
  id: string
  /** 手元の最新の課題。 */
  assignment(): Assignment
  /** 課題のテーマを書き換える。 */
  setTheme(theme: string): void
  /** 手元の最新のアウトライン。 */
  outline(): string
}

export interface IdeasPanel {
  el: HTMLElement
  /** 課題・アウトラインが変わったら（テーマの表示・押せるか・古さの知らせを更新する）。 */
  sync(): void
}

/** 呼び出し中の AI案（`<id>/<種類>` → 結果の Promise）。画面を作り直しても残る。 */
const pending = new Map<string, Promise<unknown>>()

function track<T>(key: string, run: () => Promise<T>): Promise<T> {
  const promise = run()
  pending.set(key, promise)
  const forget = () => {
    if (pending.get(key) === promise) pending.delete(key)
  }
  promise.then(forget, forget)
  return promise
}

const createdLabel = (iso: string) => `${formatDate(iso)} ${formatTime(iso)} に出しました`

export function createIdeasPanel(options: IdeasPanelOptions): IdeasPanel {
  const { id } = options
  const keyOf = (kind: AiKind) => `${id}/${kind}`

  /** 1 つの種類の欄（ボタン・エラー・出した時刻と古さの知らせ・結果・質問の欄）。 */
  function section<T>(kind: AiKind, label: string, busyLabel: string, render: (saved: T) => void) {
    const button = h('button', { class: 'btn pri', type: 'button' }, label)
    const message = h('p', { class: 'error ai-error' })
    const meta = h('p', { class: 'muted ai-meta' })
    const qa = createQuestionBox(id, kind)
    let saved: (T & { createdAt: string }) | null = null
    let busy = false
    let disabled = false
    const paint = () => {
      button.disabled = busy || disabled
      replace(button, busy ? busyLabel : label)
      qa.setLocked(busy)
    }
    /** `questions` はその結果への質問と答え（出し直したばかりなら空）。 */
    const show = (value: T & { createdAt: string }, questions: readonly AiQuestion[] = []) => {
      // 保存してあるものの読み込みが、押して出した新しい結果より後に届いても上書きしない
      if (saved !== null && value.createdAt < saved.createdAt) return
      saved = value
      replace(meta, createdLabel(value.createdAt))
      render(value)
      qa.show(questions)
      sync()
    }
    /** 呼び出しの終わりを待って描く（このパネルで押したもの・前のパネルで押したもの）。 */
    const await_ = async (promise: Promise<unknown>) => {
      busy = true
      paint()
      replace(message)
      try {
        show((await promise) as T & { createdAt: string })
      } catch (error) {
        replace(message, `出せませんでした: ${errorText(error)}`)
      } finally {
        busy = false
        paint()
      }
    }
    return {
      button,
      message,
      meta,
      qa: qa.el,
      setStale: qa.setStale,
      get saved(): T | null {
        return saved
      },
      get busy() {
        return busy
      },
      setDisabled(value: boolean) {
        disabled = value
        paint()
      },
      start(run: () => Promise<T & { createdAt: string }>) {
        void await_(track(keyOf(kind), run))
      },
      /** 開いたとき: 呼び出し中ならその終わりを待ち、そうでなければ保存してあるもの（と質問）を描く。 */
      restore(value: (T & { createdAt: string }) | null, questions: readonly AiQuestion[]) {
        const inFlight = pending.get(keyOf(kind))
        if (inFlight !== undefined) void await_(inFlight)
        else if (value !== null) show(value, questions)
      },
    }
  }

  const now = () => new Date().toISOString()

  // --- テーマの候補 ---
  const hint = h('input', {
    class: 'ai-hint',
    type: 'text',
    maxlength: 200,
    placeholder: '分野・キーワード（任意）例: 部活、スマホ、環境',
    'aria-label': 'テーマの分野・キーワード',
  })
  const themesList = h('div', { class: 'ai-themes' })
  /** 候補ごとの「課題のテーマにする」（今のテーマと同じなら押せなくする）。 */
  let themeButtons: { en: string; button: HTMLButtonElement }[] = []
  const themes = section<SavedThemes>('themes', 'テーマの候補を出す', '考えています…', (saved) => {
    themeButtons = []
    replace(
      themesList,
      ...saved.themes.map((theme) => {
        const use = h('button', { class: 'btn ai-use', type: 'button' }, '課題のテーマにする')
        use.addEventListener('click', () => {
          options.setTheme(theme.en)
          sync()
        })
        themeButtons.push({ en: theme.en, button: use })
        return h(
          'div',
          { class: 'ai-theme' },
          h('p', { class: 'ai-theme-en', lang: 'en' }, theme.en),
          theme.ja === '' ? null : h('p', { class: 'ai-theme-ja' }, theme.ja),
          use,
        )
      }),
    )
  })
  themes.button.addEventListener('click', () => {
    const value = hint.value.trim()
    themes.start(async () => ({
      hint: value,
      themes: await suggestThemes(id, value),
      createdAt: now(),
    }))
  })

  // --- 理由・例の候補 ---
  const currentTheme = h('p', { class: 'ai-current' })
  const ideasStale = h('p', { class: 'ai-stale' })
  const ideasList = h('div', { class: 'ai-ideas' })
  const ideas = section<SavedIdeas>('ideas', '理由・例の候補を出す', '考えています…', (saved) =>
    replace(
      ideasList,
      h('p', { class: 'muted ai-sub-note' }, `テーマ: ${saved.theme}`),
      ...saved.ideas.sides.map((side) =>
        h(
          'div',
          { class: `ai-side ${side.stance}` },
          h('h4', {}, h('span', { class: 'ai-stance' }, STANCE_LABEL[side.stance]), side.opinion),
          ...side.reasons.map((reason) =>
            h(
              'div',
              { class: 'ai-reason' },
              h('p', { class: 'ai-reason-text' }, reason.reason),
              reason.examples.length === 0
                ? null
                : h('ul', {}, ...reason.examples.map((example) => h('li', {}, example))),
            ),
          ),
        ),
      ),
    ),
  )
  ideas.button.addEventListener('click', () => {
    const { theme, conditions } = options.assignment()
    ideas.start(async () => ({
      theme: theme.trim(),
      conditions,
      ideas: await suggestIdeas(id, theme, conditions),
      createdAt: now(),
    }))
  })

  // --- アウトラインの指摘 ---
  const reviewNote = h('p', { class: 'muted ai-sub-note' })
  const reviewStale = h('p', { class: 'ai-stale' })
  const reviewResult = h('div', { class: 'ai-review' })
  const review = section<SavedOutlineReview>(
    'outline',
    'アウトラインを見てもらう',
    '見ています…',
    ({ review: result }) =>
      replace(
        reviewResult,
        result.summary === '' ? null : h('p', { class: 'ai-review-summary' }, result.summary),
        result.findings.length === 0
          ? h('p', { class: 'muted' }, '大きな指摘はありません。')
          : h(
              'ol',
              { class: 'findings' },
              ...result.findings.map((f) =>
                h('li', {}, f.quote === '' ? null : h('q', {}, f.quote), h('p', {}, f.hint)),
              ),
            ),
      ),
  )
  review.button.addEventListener('click', () => {
    const { theme, conditions } = options.assignment()
    const outline = options.outline()
    review.start(async () => ({
      theme,
      conditions,
      outline,
      review: await reviewOutline(id, theme, conditions, outline),
      createdAt: now(),
    }))
  })

  function sync(): void {
    const { theme: rawTheme, conditions } = options.assignment()
    const theme = rawTheme.trim()
    replace(currentTheme, theme === '' ? '課題のテーマを入れると出せます。' : `テーマ: ${theme}`)
    currentTheme.classList.toggle('empty', theme === '')
    ideas.setDisabled(theme === '')
    for (const { en, button } of themeButtons) {
      const current = en === theme
      button.disabled = current
      replace(button, current ? '今のテーマです' : '課題のテーマにする')
    }
    const savedIdeas = ideas.saved
    const ideasOld =
      savedIdeas !== null && !ideas.busy && isIdeasStale(savedIdeas, rawTheme, conditions)
    replace(ideasStale, ideasOld ? '課題のテーマか条件を変える前に出した候補です。' : '')
    ideas.setStale(ideasOld)

    const outline = options.outline()
    const emptyOutline = outline.trim() === ''
    replace(
      reviewNote,
      emptyOutline
        ? 'アウトラインを作ると見てもらえます。'
        : '意見・理由・例・結論のつながりを見て、直すところをヒントで返します（直した項目は出しません）。',
    )
    review.setDisabled(emptyOutline)
    const savedReview = review.saved
    const reviewOld =
      savedReview !== null &&
      !review.busy &&
      isOutlineReviewStale(savedReview, rawTheme, conditions, outline)
    replace(
      reviewStale,
      reviewOld ? 'アウトラインか課題を直す前の指摘です。もう一度見てもらえます。' : '',
    )
    review.setStale(reviewOld)
  }

  const el = h(
    'div',
    { class: 'ideas-panel' },
    h(
      'p',
      { class: 'muted ai-note' },
      'ボタンを押したときだけ、入れた分野・課題のテーマと条件・アウトラインを Anthropic の API に送ります。質問すると、その結果と質問も送ります。下書きは送りません。結果と質問はパラグラフごとに最新の 1 回分を残します。',
    ),
    h(
      'section',
      { class: 'ai-section' },
      h('h3', {}, 'テーマの候補'),
      hint,
      themes.button,
      themes.message,
      themes.meta,
      themesList,
      themes.qa,
    ),
    h(
      'section',
      { class: 'ai-section' },
      h('h3', {}, '理由・例の候補'),
      h(
        'p',
        { class: 'muted ai-sub-note' },
        '見るだけ。使えそうなものは自分の言葉でアウトラインに足す。',
      ),
      currentTheme,
      ideas.button,
      ideas.message,
      ideas.meta,
      ideasStale,
      ideasList,
      ideas.qa,
    ),
    h(
      'section',
      { class: 'ai-section' },
      h('h3', {}, 'アウトラインの指摘'),
      reviewNote,
      review.button,
      review.message,
      review.meta,
      reviewStale,
      reviewResult,
      review.qa,
    ),
  )
  sync()

  // 保存してある AI案を描く（呼び出し中のものは、その終わりを待つ）
  readAiResults(id).then(
    (saved) => {
      if (saved.themes !== null && hint.value === '') hint.value = saved.themes.hint
      themes.restore(saved.themes, saved.questions.themes)
      ideas.restore(saved.ideas, saved.questions.ideas)
      review.restore(saved.outline, saved.questions.outline)
    },
    (error: unknown) => {
      replace(themes.message, `前に出した AI案を読めません: ${errorText(error)}`)
      themes.restore(null, [])
      ideas.restore(null, [])
      review.restore(null, [])
    },
  )

  return { el, sync }
}
