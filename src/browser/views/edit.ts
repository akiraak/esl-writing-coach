import { parseAssignment, serializeAssignment } from '../../shared/assignment.js'
import { combineSaveStates, type SaveState } from '../../shared/autosave.js'
import { appendToMemo } from '../../shared/ideas.js'
import { type Route, routeHash } from '../../shared/route.js'
import { summarizeStage } from '../../shared/stage-summary.js'
import { STAGES, type Stage } from '../../shared/types.js'
import { readStage } from '../api.js'
import { h, replace } from '../dom.js'
import { openExportDialog } from '../export-dialog.js'
import { createFeedbackPanel } from '../feedback-pane.js'
import { guidePane } from '../guide-pane.js'
import { createIdeasPanel } from '../ideas-pane.js'
import {
  conflictBanner,
  openStageEditor,
  renderSaveStatus,
  type StageEditor,
} from '../stage-editor.js'
import { errorBox, header, STAGE_LABELS, STAGE_LANG } from '../ui.js'
import type { View } from '../view.js'
import { renderAssignmentView } from './assignment.js'
import { renderDraftView } from './draft.js'
import { renderIdeasView } from './ideas.js'
import { renderOutlineView } from './outline.js'

/**
 * 編集画面（3 ペイン）。左 = 段階のタイル、中央 = 選んだ段階の編集欄、右 = 学習ガイド。
 *
 * - 開いたら 4 つの段階のファイルを並べて読み、段階ごとに自動保存（`StageEditor`）を作って、
 *   **パラグラフを開いている間は持ち続ける**。同じパラグラフの中で段階を移るときは中央だけを描き直す（読み直さない）
 * - 段階を離れるときはその段階を待たずに保存する。rev は保存が終わったときに手元で新しくなるので、戻っても古い rev にはならない
 * - ヘッダの保存の状態は 4 つをまとめて出し、タイルには段階ごとの状態の行と保存の印を出す
 * - 中央の中身は段階ごとに `views/` の各ファイル（課題・アイデア・アウトライン・下書き）。一番下に次のステップへのボタン
 */

interface Tile {
  el: HTMLAnchorElement
  summary: HTMLElement
  mark: HTMLElement
}

function markOf(state: SaveState): { text: string; kind: string; title: string } {
  switch (state.kind) {
    case 'saved':
      return { text: '', kind: '', title: '' }
    case 'dirty':
      return { text: '●', kind: 'dirty', title: '未保存' }
    case 'saving':
      return { text: '●', kind: 'dirty', title: '保存中' }
    case 'error':
      return { text: '●', kind: 'error', title: `保存できません: ${state.message}` }
    case 'conflict':
      return {
        text: '競合',
        kind: 'conflict',
        title: '他で更新されています（自動保存を止めました）',
      }
  }
}

export function renderEdit(
  app: HTMLElement,
  id: string,
  initialStage: Stage,
  /** 前の画面の保存。終わってから読む（古い rev で編集を始めないため）。 */
  previousSaved: Promise<void>,
): View {
  let stage = initialStage
  let editors: Record<Stage, StageEditor> | null = null
  let closed = false
  /** 中央の段階の画面の片付け（マップのリスナを外す・打ちかけの名前を確定する）。 */
  let cleanupBody: (() => void) | null = null
  const clearBody = () => {
    cleanupBody?.()
    cleanupBody = null
  }

  const crumbTheme = h('b', {}, id)
  const status = h('span', { class: 'save-status' })
  const title = h('h2', {})
  const banner = h('div', { class: 'banner' })
  const body = h('div', { class: 'stage-body' }, h('p', { class: 'muted' }, '読み込み中…'))
  /** 中央の一番下の「次のステップへ」（STEP 4 は書き出し）。 */
  const footer = h('div', { class: 'stage-next' })
  const center = h('main', { class: 'center' }, title, banner, body, footer)

  /** 右ペインの「採点」。採点の前に全部の段階を保存し終え、下書きが保存できていなければ採点しない。 */
  const feedback = createFeedbackPanel({
    id,
    draftText: () => editors?.draft.text ?? '',
    async prepare() {
      if (editors === null) return '読み込み中です'
      const all = editors
      await Promise.all(STAGES.map((s) => all[s].flush()))
      const state = all.draft.state.kind
      if (state === 'conflict')
        return '下書きが他で更新されています（自動保存を止めています）。読み直してから採点してください'
      if (state === 'error' || all.draft.hasUnsavedChanges)
        return '下書きを保存できていません。保存できてから採点してください'
      return null
    },
  })

  /**
   * 右ペインの「AI 案」。「課題のテーマにする」「メモに足す」を押したときだけ、その段階の本文を書き換える
   * （開いている段階なら中央も描き直す）。
   */
  const ideasPanel = createIdeasPanel({
    assignment: () => parseAssignment(editors?.assignment.text ?? ''),
    setTheme(theme) {
      if (editors === null) return
      const assignment = parseAssignment(editors.assignment.text)
      editors.assignment.update(serializeAssignment({ ...assignment, theme }))
      setTheme(theme)
      if (stage === 'assignment') renderBody()
    },
    outline: () => editors?.outline.text ?? '',
    appendMemo(block) {
      if (editors === null) return
      editors.ideas.update(appendToMemo(editors.ideas.text, block))
      if (stage === 'ideas') renderBody()
    },
  })

  const tiles = {} as Record<Stage, Tile>
  STAGES.forEach((s, i) => {
    const summary = h('div', { class: 's' }, '…')
    const mark = h('span', { class: 'mark' })
    const el = h(
      'a',
      { class: 'tile', href: routeHash({ name: 'edit', id, stage: s }) },
      h(
        'span',
        { class: `lang ${STAGE_LANG[s]}` },
        STAGE_LANG[s] === 'en' ? '英語のみ' : '日本語可',
      ),
      h('div', { class: 'k' }, `STEP ${i + 1}`),
      h('div', { class: 't' }, STAGE_LABELS[s], mark),
      summary,
    )
    tiles[s] = { el, summary, mark }
  })

  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', crumbTheme)], [status, exportButton()]),
    h(
      'div',
      { class: 'panes' },
      h('nav', { class: 'stages' }, ...STAGES.map((s) => tiles[s].el)),
      center,
      guidePane([
        { key: 'ideas', label: 'AI案', el: ideasPanel.el },
        { key: 'feedback', label: '採点', el: feedback.el },
      ]),
    ),
  )

  /** 書き出し（下書きの手元の最新。まだ保存していない分も含む）。読み込み中は何もしない。 */
  function openExport(): void {
    if (editors === null) return
    openExportDialog(app, {
      id,
      theme: parseAssignment(editors.assignment.text).theme,
      text: editors.draft.text,
    })
  }
  function exportButton(label = '書き出し', className = 'btn'): HTMLButtonElement {
    return h('button', { class: className, type: 'button', onclick: openExport }, label)
  }

  const setTheme = (theme: string) => replace(crumbTheme, theme === '' ? id : theme)

  const retryAll = () => {
    for (const s of STAGES) editors?.[s].retry()
  }

  /** ヘッダの保存の状態（4 つをまとめる）と、タイルの状態の行・保存の印。 */
  function refresh(s: Stage): void {
    if (editors === null) return
    const editor = editors[s]
    const tile = tiles[s]
    replace(tile.summary, summarizeStage(s, editor.text))
    const mark = markOf(editor.state)
    tile.mark.className = `mark ${mark.kind}`
    tile.mark.title = mark.title
    replace(tile.mark, mark.text)
    const all = editors
    renderSaveStatus(status, combineSaveStates(STAGES.map((x) => all[x].state)), retryAll)
    // 競合の知らせは、その段階を開いているときだけ出す
    if (s === stage) renderBanner()
    if (s === 'draft') feedback.sync()
    if (s === 'assignment' || s === 'outline') ideasPanel.sync()
  }

  function renderBanner(): void {
    const editor = editors?.[stage]
    if (editor?.state.kind === 'conflict') {
      replace(
        banner,
        conflictBanner(editor, () => reloadStage(editor.stage)),
      )
    } else {
      replace(banner)
    }
  }

  function renderBody(): void {
    if (editors === null) return
    clearBody()
    body.className = stage === 'outline' ? 'stage-body fill' : 'stage-body'
    const editor = editors[stage]
    if (stage === 'assignment') {
      renderAssignmentView(body, { text: editor.text, editor, onThemeChange: setTheme })
    } else if (stage === 'ideas') {
      renderIdeasView(body, {
        id,
        editor,
        assignment: parseAssignment(editors.assignment.text),
      })
    } else if (stage === 'outline') {
      cleanupBody = renderOutlineView(body, {
        editor,
        theme: parseAssignment(editors.assignment.text).theme,
      })
    } else {
      cleanupBody = renderDraftView(body, {
        id,
        editor,
        assignment: parseAssignment(editors.assignment.text),
        outline: editors.outline.text,
      })
    }
  }

  /** 段階を選ぶ（中央だけを描き直す）。 */
  function show(next: Stage): void {
    if (editors !== null && next !== stage) {
      // 先に片付ける（打ちかけの名前を確定してから保存する）
      clearBody()
      void editors[stage].flush()
    }
    stage = next
    for (const s of STAGES) tiles[s].el.classList.toggle('on', s === stage)
    replace(title, STAGE_LABELS[stage])
    renderFooter()
    renderBanner()
    renderBody()
    // 中央のペインは使い回すので、前の段階のスクロール位置を残さない
    center.scrollTop = 0
  }

  /** 次のステップへのボタン。押すと左のタイルと同じく、その場で段階が切り替わる。 */
  function renderFooter(): void {
    const index = STAGES.indexOf(stage)
    const next = STAGES[index + 1]
    if (next === undefined) {
      // 最後の段階（下書き）は書き出し
      replace(footer, exportButton('書き出し →', 'btn pri next-step'))
      return
    }
    replace(
      footer,
      h(
        'a',
        { class: 'btn pri next-step', href: routeHash({ name: 'edit', id, stage: next }) },
        `STEP ${index + 2} ${STAGE_LABELS[next]}へ →`,
      ),
    )
  }

  function attach(editor: StageEditor): void {
    editor.subscribe(() => {
      if (!closed) refresh(editor.stage)
    })
  }

  /** 競合のあと、その段階のファイルだけを読み直す（手元の変更は捨てる）。 */
  async function reloadStage(s: Stage): Promise<void> {
    if (editors === null) return
    const content = await readStage(id, s)
    if (closed || editors === null) return
    if (s === stage) clearBody()
    editors[s].discard()
    const editor = openStageEditor(id, s, content)
    editors[s] = editor
    attach(editor)
    if (s === 'assignment') setTheme(parseAssignment(editor.text).theme)
    refresh(s)
    if (s === stage) renderBody()
  }

  async function load(): Promise<void> {
    await previousSaved
    const contents = await Promise.all(STAGES.map((s) => readStage(id, s)))
    if (closed) return
    const opened = {} as Record<Stage, StageEditor>
    STAGES.forEach((s, i) => {
      const content = contents[i]
      if (content !== undefined) opened[s] = openStageEditor(id, s, content)
    })
    editors = opened
    for (const s of STAGES) {
      attach(opened[s])
      refresh(s)
    }
    setTheme(parseAssignment(opened.assignment.text).theme)
    renderBody()
  }

  show(stage)
  load().catch((error: unknown) => {
    if (!closed) replace(body, errorBox(error))
  })

  const all = () => (editors === null ? [] : STAGES.map((s) => editors?.[s] as StageEditor))

  return {
    navigate(route: Route) {
      if (route.name !== 'edit' || route.id !== id) return false
      show(route.stage)
      return true
    },
    async dispose() {
      clearBody()
      closed = true
      await Promise.all(all().map((editor) => editor.close()))
    },
    hasUnsavedChanges: () => all().some((editor) => editor.hasUnsavedChanges),
    flush: () => Promise.all(all().map((editor) => editor.flush())).then(() => {}),
  }
}
