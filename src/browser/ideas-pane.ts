import type { Assignment } from '../shared/assignment.js'
import {
  type IdeaSuggestions,
  memoBlock,
  STANCE_LABEL,
  type ThemeSuggestion,
} from '../shared/ideas.js'
import { suggestIdeas, suggestThemes } from './api.js'
import { h, replace } from './dom.js'
import { errorText } from './ui.js'

/**
 * 編集画面の右ペインの「AI 案」タブ（AI のアイデア出し。`docs/plans/archive/ai-ideas.md`）。
 *
 * - **テーマの候補**: 分野・キーワード（任意）から、英語の問いと日本語訳。「課題のテーマにする」を押したときだけテーマを書き換える
 * - **理由・例の候補**: 課題のテーマ（手元の最新）から、賛成・反対それぞれの理由と例（日本語）。「メモに足す」を押したときだけメモに書き足す
 * - どちらもボタンを押したときだけ呼ぶ。結果は保存しない（編集画面を開いている間だけ持つ）
 */

export interface IdeasPanelOptions {
  /** 手元の最新の課題。 */
  assignment(): Assignment
  /** 課題のテーマを書き換える。 */
  setTheme(theme: string): void
  /** アイデアのメモの末尾に書き足す。 */
  appendMemo(block: string): void
}

export interface IdeasPanel {
  el: HTMLElement
  /** 課題が変わったら（テーマの表示と、押せるかを更新する）。 */
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
          ...side.reasons.map((reason) => {
            const add = h('button', { class: 'btn ai-use', type: 'button' }, 'メモに足す')
            add.addEventListener('click', () => {
              options.appendMemo(memoBlock(side.stance, reason))
              replace(add, '足しました')
            })
            return h(
              'div',
              { class: 'ai-reason' },
              h('p', { class: 'ai-reason-text' }, reason.reason),
              reason.examples.length === 0
                ? null
                : h('ul', {}, ...reason.examples.map((example) => h('li', {}, example))),
              add,
            )
          }),
        ),
      ),
    )

  ideasButton.addEventListener('click', () =>
    running(ideasButton, ideasMessage, '考えています…', async () => {
      const { theme, conditions } = options.assignment()
      renderIdeas(await suggestIdeas(theme, conditions))
    }),
  )

  function sync(): void {
    const theme = options.assignment().theme.trim()
    replace(currentTheme, theme === '' ? '課題のテーマを入れると出せます。' : `テーマ: ${theme}`)
    currentTheme.classList.toggle('empty', theme === '')
    if (!ideasButton.textContent?.includes('考えています')) ideasButton.disabled = theme === ''
  }

  const el = h(
    'div',
    { class: 'ideas-panel' },
    h(
      'p',
      { class: 'muted ai-note' },
      'ボタンを押したときだけ、入れた分野・課題のテーマと条件を Anthropic の API に送って候補を出します。下書きやメモは送りません。',
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
      currentTheme,
      ideasButton,
      ideasMessage,
      ideasList,
    ),
  )
  sync()
  return { el, sync }
}
