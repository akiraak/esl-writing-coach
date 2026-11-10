import type { Assignment } from '../shared/assignment.js'
import {
  type IdeaSuggestions,
  type OutlineReview,
  STANCE_LABEL,
  type ThemeSuggestion,
} from '../shared/ideas.js'
import { reviewOutline, suggestIdeas, suggestThemes } from './api.js'
import { h, replace } from './dom.js'
import { errorText } from './ui.js'

/**
 * 編集画面の右ペインの「AI 案」タブ（AI のアイデア出し。`docs/plans/archive/ai-ideas.md`）。
 *
 * - **テーマの候補**: 分野・キーワード（任意）から、英語の問いと日本語訳。「課題のテーマにする」を押したときだけテーマを書き換える
 * - **理由・例の候補**: 課題のテーマ（手元の最新）から、賛成・反対それぞれの理由と例（日本語）。**見るだけ**
 *   （書き足す先のメモをなくした。見ながら自分でアウトラインに足す。`docs/plans/ideas-outline.md`）
 * - **アウトラインの指摘**: 課題のテーマと条件・アウトラインから、構成の問題を日本語のヒントで（直した項目は出さない）
 * - どれもボタンを押したときだけ呼ぶ。結果は保存しない（編集画面を開いている間だけ持つ）
 */

export interface IdeasPanelOptions {
  /** 手元の最新の課題。 */
  assignment(): Assignment
  /** 課題のテーマを書き換える。 */
  setTheme(theme: string): void
  /** 手元の最新のアウトライン。 */
  outline(): string
}

export interface IdeasPanel {
  el: HTMLElement
  /** 課題・アウトラインが変わったら（テーマの表示と、押せるかを更新する）。 */
  sync(): void
}

/** 押している間は押せなくし、終わったら戻す。失敗は `message` に出す。 */
async function running(
  button: HTMLButtonElement,
  message: HTMLElement,
  label: string,
  run: () => Promise<void>,
) {
  const idle = button.textContent ?? ''
  button.disabled = true
  replace(button, label)
  replace(message)
  try {
    await run()
  } catch (error) {
    replace(message, `出せませんでした: ${errorText(error)}`)
  } finally {
    button.disabled = false
    replace(button, idle)
  }
}

export function createIdeasPanel(options: IdeasPanelOptions): IdeasPanel {
  // --- テーマの候補 ---
  const hint = h('input', {
    class: 'ai-hint',
    type: 'text',
    maxlength: 200,
    placeholder: '分野・キーワード（任意）例: 部活、スマホ、環境',
    'aria-label': 'テーマの分野・キーワード',
  })
  const themesButton = h('button', { class: 'btn pri', type: 'button' }, 'テーマの候補を出す')
  const themesMessage = h('p', { class: 'error ai-error' })
  const themesList = h('div', { class: 'ai-themes' })

  const renderThemes = (themes: ThemeSuggestion[]) =>
    replace(
      themesList,
      ...themes.map((theme) => {
        const use = h('button', { class: 'btn ai-use', type: 'button' }, '課題のテーマにする')
        use.addEventListener('click', () => {
          options.setTheme(theme.en)
          replace(use, 'テーマにしました')
          sync()
        })
        return h(
          'div',
          { class: 'ai-theme' },
          h('p', { class: 'ai-theme-en', lang: 'en' }, theme.en),
          theme.ja === '' ? null : h('p', { class: 'ai-theme-ja' }, theme.ja),
          use,
        )
      }),
    )

  themesButton.addEventListener('click', () =>
    running(themesButton, themesMessage, '考えています…', async () => {
      renderThemes(await suggestThemes(hint.value.trim()))
    }),
  )

  // --- 理由・例の候補 ---
  const currentTheme = h('p', { class: 'ai-current' })
  const ideasButton = h('button', { class: 'btn pri', type: 'button' }, '理由・例の候補を出す')
  const ideasMessage = h('p', { class: 'error ai-error' })
  const ideasList = h('div', { class: 'ai-ideas' })

  const renderIdeas = (ideas: IdeaSuggestions) =>
    replace(
      ideasList,
      ...ideas.sides.map((side) =>
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
    )

  ideasButton.addEventListener('click', () =>
    running(ideasButton, ideasMessage, '考えています…', async () => {
      const { theme, conditions } = options.assignment()
      renderIdeas(await suggestIdeas(theme, conditions))
    }),
  )

  // --- アウトラインの指摘 ---
  const reviewButton = h('button', { class: 'btn pri', type: 'button' }, 'アウトラインを見てもらう')
  const reviewNote = h('p', { class: 'muted ai-sub-note' })
  const reviewMessage = h('p', { class: 'error ai-error' })
  const reviewResult = h('div', { class: 'ai-review' })

  const renderReview = (review: OutlineReview) =>
    replace(
      reviewResult,
      review.summary === '' ? null : h('p', { class: 'ai-review-summary' }, review.summary),
      review.findings.length === 0
        ? h('p', { class: 'muted' }, '大きな指摘はありません。')
        : h(
            'ol',
            { class: 'findings' },
            ...review.findings.map((f) =>
              h('li', {}, f.quote === '' ? null : h('q', {}, f.quote), h('p', {}, f.hint)),
            ),
          ),
    )

  reviewButton.addEventListener('click', () =>
    running(reviewButton, reviewMessage, '見ています…', async () => {
      const { theme, conditions } = options.assignment()
      renderReview(await reviewOutline(theme, conditions, options.outline()))
    }),
  )

  function sync(): void {
    const theme = options.assignment().theme.trim()
    replace(currentTheme, theme === '' ? '課題のテーマを入れると出せます。' : `テーマ: ${theme}`)
    currentTheme.classList.toggle('empty', theme === '')
    if (!ideasButton.textContent?.includes('考えています')) ideasButton.disabled = theme === ''
    const emptyOutline = options.outline().trim() === ''
    replace(
      reviewNote,
      emptyOutline
        ? 'アウトラインを作ると見てもらえます。'
        : '意見・理由・例・結論のつながりを見て、直すところをヒントで返します（直した項目は出しません）。',
    )
    if (!reviewButton.textContent?.includes('見ています')) reviewButton.disabled = emptyOutline
  }

  const el = h(
    'div',
    { class: 'ideas-panel' },
    h(
      'p',
      { class: 'muted ai-note' },
      'ボタンを押したときだけ、入れた分野・課題のテーマと条件・アウトラインを Anthropic の API に送ります。下書きは送りません。',
    ),
    h(
      'section',
      { class: 'ai-section' },
      h('h3', {}, 'テーマの候補'),
      hint,
      themesButton,
      themesMessage,
      themesList,
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
      ideasButton,
      ideasMessage,
      ideasList,
    ),
    h(
      'section',
      { class: 'ai-section' },
      h('h3', {}, 'アウトラインの指摘'),
      reviewNote,
      reviewButton,
      reviewMessage,
      reviewResult,
    ),
  )
  sync()
  return { el, sync }
}
