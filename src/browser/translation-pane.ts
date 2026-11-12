import type { Translation } from '../shared/translation.js'
import { type AiCard, cardFrame, whenLabels } from './ai-pane.js'
import { readTranslation, translateParagraph } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatDate, formatTime } from './ui.js'

/**
 * 編集画面の右ペインの日本語訳のカード（`docs/plans/archive/draft-translation.md`）。STEP 3 の「翻訳」のタブに出る。並べ方は `ai-pane.ts`。
 *
 * - 「日本語に訳す」を押したときだけ訳す。押したら手元の未保存を保存し終えてから、サーバが保存された下書きを読んで訳す（採点と同じ）
 * - 結果は文ごとの「英文（本文そのまま）→ 訳」。訳は直訳に近いもの（言いたいことが英語で伝わっているかを確かめるため）
 * - 訳した後に本文を直したら知らせる（もう一度訳せる）
 * - 編集画面を開いている間は 1 つを持ち続ける（段階・タブを移っても、訳している途中の状態と結果を保つ）
 */

export interface TranslationPanelOptions {
  id: string
  /** 手元の最新の下書き。 */
  draftText(): string
  /** 訳す前に全部の段階を保存し終える。下書きを保存できなかった・競合しているなら、理由の文を返す（訳さない）。 */
  prepare(): Promise<string | null>
}

export interface TranslationPanel {
  card: AiCard
  /** 下書きが変わったら（「本文が変わっています」・空なら押せない、を更新する）。 */
  sync(): void
}

export function createTranslationPanel(options: TranslationPanelOptions): TranslationPanel {
  let translation: Translation | null = null
  let configured = true
  let loaded = false
  let busy = false
  let error = ''

  const button = h('button', { class: 'btn pri', type: 'button' }, '日本語に訳す')
  const note = h('p', { class: 'muted ai-card-desc' })
  const message = h('p', { class: 'error ai-error' })
  const stale = h('p', { class: 'ai-stale' })
  const empty = h('p', { class: 'muted ai-sub-note' })
  const result = h('ol', { class: 'tr-list' })
  const when = whenLabels()
  const card: AiCard = {
    el: cardFrame({
      title: '日本語訳',
      when: when.create('head'),
      desc: note,
      button,
      sends: '下書き',
      after: [message, stale, empty, result],
    }),
    whenLabel: () => when.create('row'),
  }

  function sync(): void {
    const noDraft = options.draftText().trim() === ''
    button.disabled = busy || noDraft || !configured || !loaded
    replace(button, busy ? '訳しています…' : translation === null ? '日本語に訳す' : 'もう一度訳す')
    replace(
      note,
      !loaded
        ? '読み込み中…'
        : !configured
          ? 'ANTHROPIC_API_KEY が設定されていません。.env に入れてサーバを起動し直すと使えます。'
          : busy
            ? '数秒〜30 秒ほどかかります。'
            : noDraft
              ? '下書きを書くと訳せます。'
              : '下書きを文ごとに、直訳に近い日本語にします。言いたいことが英語で伝わっているかを確かめられます（誤りは直さずに、書いてあるとおりに訳します）。',
    )
    replace(message, error)
    replace(
      stale,
      translation !== null && translation.draft.trim() !== options.draftText().trim()
        ? '訳した後に本文が変わっています。もう一度訳すと今の本文の訳になります。'
        : '',
    )
  }

  function renderResult(): void {
    when.set(
      translation === null || translation.translatedAt === ''
        ? ''
        : `${formatDate(translation.translatedAt)} ${formatTime(translation.translatedAt)}`,
    )
    replace(empty, translation === null && loaded ? 'まだ訳していません。' : '')
    result.hidden = translation === null
    replace(
      result,
      ...(translation?.sentences ?? []).map((s) =>
        h(
          'li',
          {},
          h('p', { class: 'tr-en', lang: 'en' }, s.en),
          s.ja === ''
            ? h('p', { class: 'tr-ja muted' }, '（訳がありません。もう一度訳してください）')
            : h('p', { class: 'tr-ja' }, s.ja),
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
        translation = await translateParagraph(options.id)
        renderResult()
      }
    } catch (e) {
      error = `訳せませんでした: ${errorText(e)}`
    } finally {
      busy = false
      sync()
    }
  })

  readTranslation(options.id).then(
    (state) => {
      translation = state.translation
      configured = state.aiConfigured
      loaded = true
      renderResult()
      sync()
    },
    (e: unknown) => {
      loaded = true
      error = `訳を読めません: ${errorText(e)}`
      renderResult()
      sync()
    },
  )

  renderResult()
  sync()
  return { card, sync }
}
