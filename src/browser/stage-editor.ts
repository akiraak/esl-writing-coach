import { type Autosave, createAutosave, type SaveState } from '../shared/autosave.js'
import type { Stage, StageContent } from '../shared/types.js'
import { ApiError, saveStage } from './api.js'
import { h, replace } from './dom.js'
import { errorText, formatTime } from './ui.js'

/**
 * 段階のファイル 1 つを自動保存でつなぐ（状態の移り変わりは `src/shared/autosave.ts`）。
 * 各段階の画面は、本文が変わったら `update(text)` を呼ぶだけでよい。
 *
 * 編集画面はパラグラフを開いている間、段階ごとに 1 つずつ持ち続ける（`src/browser/views/edit.ts`）。
 * 段階を移って戻ったときは `text`（手元の最新）から描き直す。保存の状態の見せ方は編集画面が受け持つ。
 */

export interface StageEditor {
  readonly stage: Stage
  /** 手元の最新の本文。 */
  readonly text: string
  readonly state: SaveState
  readonly hasUnsavedChanges: boolean
  update(text: string): void
  /** 未保存があれば今すぐ保存する（段階・画面を離れるとき）。 */
  flush(): Promise<void>
  /** 保存できなかったあとにもう一度。 */
  retry(): void
  /** 本文か保存の状態が変わったら呼ぶ。 */
  subscribe(listener: () => void): void
  /** 保存してから捨てる（画面を離れるとき）。 */
  close(): Promise<void>
  /** 保存せずに捨てる（競合のあと読み直すとき）。 */
  discard(): void
}

export function openStageEditor(id: string, stage: Stage, content: StageContent): StageEditor {
  let latest = content.text
  const listeners: (() => void)[] = []
  const notify = () => {
    for (const listener of listeners) listener()
  }

  const autosave: Autosave = createAutosave({
    text: content.text,
    base: { rev: content.rev },
    save: (text, base) => saveStage(id, stage, text, base),
    isConflict: (error) => error instanceof ApiError && error.isConflict,
    describeError: errorText,
    onChange: notify,
  })

  return {
    stage,
    get text() {
      return latest
    },
    get state() {
      return autosave.state
    },
    get hasUnsavedChanges() {
      return autosave.hasUnsavedChanges
    },
    update(text: string) {
      if (text === latest) return
      latest = text
      autosave.update(text)
      notify()
    },
    flush: () => autosave.flush(),
    retry: () => autosave.retry(),
    subscribe(listener) {
      listeners.push(listener)
    },
    async close() {
      try {
        await autosave.flush()
      } finally {
        autosave.dispose()
        listeners.length = 0
      }
    },
    discard() {
      autosave.dispose()
      listeners.length = 0
    },
  }
}

/** ヘッダの「保存済み 14:32 / 未保存 / 保存中… / 保存できません（再試行）/ 自動保存を停止」。 */
export function renderSaveStatus(status: HTMLElement, state: SaveState, retry: () => void): void {
  status.className = `save-status ${state.kind}`
  status.title = state.kind === 'error' ? state.message : ''
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

/**
 * 競合の知らせ（本文の上）。手元の内容は画面に残し、「手元の内容をコピー」と「読み直す（手元の変更は捨てる）」を置く。
 */
export function conflictBanner(editor: StageEditor, reload: () => void): HTMLElement {
  const copied = h('span', { class: 'muted' })
  return h(
    'div',
    { class: 'conflict-banner' },
    h('b', {}, '他の端末（または別のタブ）で更新されています。'),
    ' 上書きしないよう、この段階の自動保存を止めました。手元の変更は画面に残っています。',
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            navigator.clipboard.writeText(editor.text).then(
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
            if (confirm('手元の変更を捨てて、保存されている内容を読み直しますか？')) reload()
          },
        },
        '読み直す（手元の変更は捨てる）',
      ),
      copied,
    ),
  )
}
