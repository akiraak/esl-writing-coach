import { type Autosave, createAutosave, type SaveState } from '../shared/autosave.js'
import type { Stage, StageContent } from '../shared/types.js'
import { ApiError, saveStage } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatTime } from './ui.js'

/**
 * 段階のファイル 1 つを自動保存でつなぐ（状態の移り変わりは `src/shared/autosave.ts`）。
 * 各段階の画面は、本文が変わったら `update(text)` を呼ぶだけでよい。
 *
 * - ヘッダの `status` に「保存済み 14:32 / 未保存 / 保存中… / 保存できません（再試行）/ 自動保存を停止」を出す
 * - 競合のときは `banner` に知らせを出す。手元の内容は画面に残し、「読み直す（手元の変更は捨てる）」と「手元の内容をコピー」を置く
 */

export interface StageEditor {
  update(text: string): void
  /** 画面を離れるとき。未保存があれば待たずに保存する。 */
  close(): Promise<void>
  readonly hasUnsavedChanges: boolean
  readonly autosave: Autosave
}

export interface StageEditorOptions {
  id: string
  stage: Stage
  content: StageContent
  /** ヘッダの保存の状態を出す所。 */
  status: HTMLElement
  /** 競合の知らせを出す所（本文の上）。 */
  banner: HTMLElement
  /** 「読み直す」を押したとき（画面を開き直す）。 */
  reload(): void
}

function renderStatus(status: HTMLElement, state: SaveState, retry: () => void): void {
  status.className = `save-status ${state.kind}`
  switch (state.kind) {
    case 'saved':
      replace(status, state.at === null ? '保存済み' : `✓ 保存済み ${formatTime(state.at)}`)
      break
    case 'dirty':
      replace(status, '未保存')
      break
    case 'saving':
      replace(status, '保存中…')
      break
    case 'error':
      status.title = state.message
      replace(
        status,
        '保存できません ',
        h('button', { class: 'link', type: 'button', onclick: () => retry() }, '再試行'),
      )
      break
    case 'conflict':
      replace(status, '自動保存を停止')
      break
  }
}

export function openStageEditor(options: StageEditorOptions): StageEditor {
  const { status, banner } = options
  let latest = options.content.text

  const autosave = createAutosave({
    text: options.content.text,
    base: { rev: options.content.rev, format: options.content.format },
    save: (text, base) => saveStage(options.id, options.stage, text, base),
    isConflict: (error) => error instanceof ApiError && error.isConflict,
    describeError: errorText,
    onChange: (state) => {
      renderStatus(status, state, () => autosave.retry())
      if (state.kind === 'conflict') showConflict()
    },
  })

  function showConflict(): void {
    const copied = h('span', { class: 'muted' })
    replace(
      banner,
      h(
        'div',
        { class: 'conflict-banner' },
        h('b', {}, '他の端末（または別のタブ）で更新されています。'),
        ' 上書きしないよう、自動保存を止めました。手元の変更は画面に残っています。',
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                navigator.clipboard.writeText(latest).then(
                  () => replace(copied, 'コピーしました'),
                  () => replace(copied, 'コピーできません'),
                )
              },
            },
            '手元の内容をコピー',
          ),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                if (confirm('手元の変更を捨てて、保存されている内容を読み直しますか？')) {
                  autosave.dispose()
                  options.reload()
                }
              },
            },
            '読み直す（手元の変更は捨てる）',
          ),
          copied,
        ),
      ),
    )
  }

  renderStatus(status, autosave.state, () => autosave.retry())

  return {
    update(text: string) {
      latest = text
      autosave.update(text)
    },
    async close() {
      try {
        await autosave.flush()
      } finally {
        autosave.dispose()
      }
    },
    get hasUnsavedChanges() {
      return autosave.hasUnsavedChanges
    },
    autosave,
  }
}
