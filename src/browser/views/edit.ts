import { parseAssignment, serializeAssignment } from '../../shared/assignment.js'
import { combineSaveStates, type SaveState } from '../../shared/autosave.js'
import { type Route, routeHash } from '../../shared/route.js'
import { summarizeStage } from '../../shared/stage-summary.js'
import { DOCS, type Doc, STAGES, type Stage } from '../../shared/types.js'
import { createAiPane } from '../ai-pane.js'
import { readStage } from '../api.js'
import { h, replace } from '../dom.js'
import { createDraftChatPanel } from '../draft-chat-pane.js'
import { openExportDialog } from '../export-dialog.js'
import { createFeedbackPanel } from '../feedback-pane.js'
import { createGuideDrawer } from '../guide-pane.js'
import { createIdeasPanel } from '../ideas-pane.js'
import { mountPaneResizer } from '../pane-resizer.js'
import {
  conflictBanner,
  openStageEditor,
  renderSaveStatus,
  type StageEditor,
} from '../stage-editor.js'
import { createTranslationPanel } from '../translation-pane.js'
import { errorBox, header, STAGE_LABELS, STAGE_LANG } from '../ui.js'
import type { View } from '../view.js'
import { renderAssignmentView } from './assignment.js'
import { renderDraftView } from './draft.js'
import { renderOutlineView } from './outline.js'

/**
 * 編集画面（3 ペイン）。左 = 段階のタイル、中央 = 選んだ段階の編集欄、右 = AI（今の段階で使うものを上に。STEP 3 は「AI / 翻訳 / 採点」のタブ。`ai-pane.ts`）。
 * 学習ガイドはヘッダの「学習ガイド」で、右ペインの上に引き出しで重ねて開く（`guide-pane.ts`。`docs/plans/archive/right-pane-layout.md`）。
 *
 * - 開いたら 3 つの段階と STEP 3 のタイトル（`DOCS`。タイトルは下書きとは別の項目。`docs/plans/archive/draft-title.md`）を
 *   並べて読み、それぞれに自動保存（`StageEditor`）を作って、
 *   **パラグラフを開いている間は持ち続ける**。同じパラグラフの中で段階を移るときは中央だけを描き直す（読み直さない）
 * - 段階を離れるときはその段階を待たずに保存する。rev は保存が終わったときに手元で新しくなるので、戻っても古い rev にはならない
 * - ヘッダの保存の状態は 3 つをまとめて出し、タイルには段階ごとの状態の行と保存の印を出す
 * - 左ペインは中央との境のつまみで閉じられる（中央が広がる。開閉はブラウザに覚える。`docs/plans/archive/left-pane-toggle.md`）
 * - 中央の中身は段階ごとに `views/` の各ファイル（課題・アウトライン・下書き）。一番下に次のステップへのボタン
 */

const LEFT_PANE_KEY = 'esl-writing.left-pane'

/** 左ペインを閉じているか（覚えていなければ開いている）。 */
function loadLeftClosed(): boolean {
  try {
    return localStorage.getItem(LEFT_PANE_KEY) === 'closed'
  } catch {
    return false
  }
}

function saveLeftClosed(closed: boolean): void {
  try {
    if (closed) localStorage.setItem(LEFT_PANE_KEY, 'closed')
    else localStorage.removeItem(LEFT_PANE_KEY)
  } catch {
    // 覚えられなくても開閉はできる
  }
}

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
  let editors: Record<Doc, StageEditor> | null = null
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
  /** 中央の一番下の「次のステップへ」（最後の下書きは書き出し）。 */
  const footer = h('div', { class: 'stage-next' })
  const center = h('main', { class: 'center' }, title, banner, body, footer)

  /**
   * サーバが保存されている下書きを読む AI（採点・AI に質問・日本語訳）の前に、全部の段階を保存し終える。
   * 下書きが保存できていなければ理由の文を返す（呼ばない）。`what` は「採点」「質問」「翻訳」。
   */
  async function prepareDraft(what: string): Promise<string | null> {
    if (editors === null) return '読み込み中です'
    const all = editors
    await Promise.all(DOCS.map((d) => all[d].flush()))
    // サーバが読むのは下書きとタイトル
    for (const d of ['draft', 'title'] as const) {
      const name = d === 'draft' ? '下書き' : 'タイトル'
      const state = all[d].state.kind
      if (state === 'conflict')
        return `${name}が他で更新されています（自動保存を止めています）。読み直してから${what}してください`
      if (state === 'error' || all[d].hasUnsavedChanges)
        return `${name}を保存できていません。保存できてから${what}してください`
    }
    return null
  }

  /** 右ペインの採点。採点の前に全部の段階を保存し終え、下書きが保存できていなければ採点しない。 */
  const feedback = createFeedbackPanel({
    id,
    draftText: () => editors?.draft.text ?? '',
    titleText: () => editors?.title.text ?? '',
    prepare: () => prepareDraft('採点'),
  })

  /** 右ペインの日本語訳（STEP 3 の「翻訳」のタブ）。訳す前に保存し終えるのは採点と同じ。 */
  const translation = createTranslationPanel({
    id,
    draftText: () => editors?.draft.text ?? '',
    titleText: () => editors?.title.text ?? '',
    prepare: () => prepareDraft('翻訳'),
  })

  /** 右ペインの「AI に質問」（STEP 3 で上に出る）。送る前に保存し終えるのは採点と同じ。 */
  const draftChat = createDraftChatPanel({ id, prepare: () => prepareDraft('質問') })

  /**
   * 右ペインの AI 案。結果はサーバがパラグラフごとに保存する（開いたら描き直す）。
   * 「課題のテーマにする」を押したときだけ課題の本文を書き換える（課題を開いていれば中央も描き直す）。
   */
  const ideasPanel = createIdeasPanel({
    id,
    assignment: () => parseAssignment(editors?.assignment.text ?? ''),
    setTheme(theme) {
      if (editors === null) return
      const assignment = parseAssignment(editors.assignment.text)
      editors.assignment.update(serializeAssignment({ ...assignment, theme }))
      setTheme(theme)
      if (stage === 'assignment') renderBody()
    },
    outline: () => editors?.outline.text ?? '',
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

  const aiPane = createAiPane({
    ...ideasPanel.cards,
    chat: draftChat.card,
    translate: translation.card,
    score: feedback.card,
  })
  const guide = createGuideDrawer()
  const panes = h(
    'div',
    { class: 'panes' },
    h('nav', { class: 'stages' }, ...STAGES.map((s) => tiles[s].el)),
    center,
    aiPane.el,
    guide.el,
  )
  /** 左ペインと中央の境のつまみ（押すと左ペインを閉じる・開く。形は STEP 3 のアウトラインのつまみと同じ）。 */
  const leftHandle = h('button', {
    class: 'side-handle left-handle',
    type: 'button',
    onclick: () => setLeftClosed(!panes.classList.contains('left-closed')),
  })
  function setLeftClosed(leftClosed: boolean): void {
    panes.classList.toggle('left-closed', leftClosed)
    saveLeftClosed(leftClosed)
    const label = leftClosed
      ? '段階の一覧（左ペイン）を開く'
      : '段階の一覧（左ペイン）を閉じて、中央を広げる'
    leftHandle.title = label
    leftHandle.setAttribute('aria-label', label)
    leftHandle.setAttribute('aria-expanded', leftClosed ? 'false' : 'true')
    replace(leftHandle, leftClosed ? '›' : '‹')
  }
  panes.append(leftHandle)
  setLeftClosed(loadLeftClosed())
  /** 右ペインの幅を変える境（引き出しも同じ幅）。 */
  const resizer = mountPaneResizer(panes)
  panes.append(resizer.el)
  replace(
    app,
    header(
      [h('span', { class: 'crumb' }, '／ ', crumbTheme)],
      [status, exportButton()],
      guide.button,
    ),
    panes,
  )

  /** 書き出し（下書きの手元の最新。まだ保存していない分も含む）。読み込み中は何もしない。 */
  function openExport(): void {
    if (editors === null) return
    openExportDialog(app, {
      id,
      title: editors.title.text,
      text: editors.draft.text,
    })
  }
  function exportButton(label = '書き出し', className = 'btn'): HTMLButtonElement {
    return h('button', { class: className, type: 'button', onclick: openExport }, label)
  }

  const setTheme = (theme: string) => replace(crumbTheme, theme === '' ? id : theme)

  const retryAll = () => {
    for (const d of DOCS) editors?.[d].retry()
  }

  /** ヘッダの保存の状態（3 つをまとめる）と、タイルの状態の行・保存の印。 */
  function refresh(s: Doc): void {
    if (editors === null) return
    const editor = editors[s]
    // タイトルにはタイルが無い（保存の状態はヘッダと、下書きのタイルの印に出す）
    const tileStage: Stage = s === 'title' ? 'draft' : s
    const tile = tiles[tileStage]
    if (s !== 'title') replace(tile.summary, summarizeStage(s, editor.text))
    const states =
      tileStage === 'draft' ? [editors.draft.state, editors.title.state] : [editor.state]
    const mark = markOf(combineSaveStates(states))
    tile.mark.className = `mark ${mark.kind}`
    tile.mark.title = mark.title
    replace(tile.mark, mark.text)
    const all = editors
    renderSaveStatus(status, combineSaveStates(DOCS.map((x) => all[x].state)), retryAll)
    // 競合の知らせは、その段階を開いているときだけ出す
    if (shownDocs().includes(s)) renderBanner()
    if (s === 'draft' || s === 'title') {
      feedback.sync()
      translation.sync()
    }
    if (s === 'assignment' || s === 'outline') ideasPanel.sync()
  }

  /** 今の段階の画面で編集する項目（下書きの画面にはタイトルもある）。 */
  const shownDocs = (): Doc[] => (stage === 'draft' ? ['draft', 'title'] : [stage])

  function renderBanner(): void {
    const conflicted = shownDocs().flatMap((d) => {
      const editor = editors?.[d]
      return editor?.state.kind === 'conflict' ? [editor] : []
    })
    replace(
      banner,
      ...conflicted.map((editor) => conflictBanner(editor, () => reloadStage(editor.stage))),
    )
  }

  function renderBody(): void {
    if (editors === null) return
    clearBody()
    // アウトラインと下書きは高さを中央のペインに合わせ、図・本文の欄の中でスクロールさせる
    body.className =
      stage === 'outline' ? 'stage-body fill' : stage === 'draft' ? 'stage-body fit' : 'stage-body'
    const editor = editors[stage]
    const titleEditor = editors.title
    if (stage === 'assignment') {
      renderAssignmentView(body, { text: editor.text, editor, onThemeChange: setTheme })
    } else if (stage === 'outline') {
      cleanupBody = renderOutlineView(body, {
        id,
        editor,
        assignment: parseAssignment(editors.assignment.text),
      })
    } else {
      cleanupBody = renderDraftView(body, {
        id,
        editor,
        title: titleEditor,
        assignment: parseAssignment(editors.assignment.text),
        outline: editors.outline.text,
        exportButton: () => exportButton('書き出し →', 'btn pri next-step'),
      })
    }
  }

  /** 段階を選ぶ（中央だけを描き直す）。 */
  function show(next: Stage): void {
    if (editors !== null && next !== stage) {
      // 先に片付ける（打ちかけの名前を確定してから保存する）
      clearBody()
      for (const d of shownDocs()) void editors[d].flush()
    }
    stage = next
    for (const s of STAGES) tiles[s].el.classList.toggle('on', s === stage)
    aiPane.setStage(stage)
    guide.setStage(stage)
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
    // 下書きは本文の欄を下いっぱいに使うので、「書き出し →」は下書きの画面の右の列（アウトラインのリストの下）に置く
    center.classList.toggle('is-draft', next === undefined)
    if (next === undefined) {
      replace(footer)
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
  async function reloadStage(s: Doc): Promise<void> {
    if (editors === null) return
    const content = await readStage(id, s)
    if (closed || editors === null) return
    const shown = shownDocs().includes(s)
    if (shown) clearBody()
    editors[s].discard()
    const editor = openStageEditor(id, s, content)
    editors[s] = editor
    attach(editor)
    if (s === 'assignment') setTheme(parseAssignment(editor.text).theme)
    refresh(s)
    if (shown) renderBody()
  }

  async function load(): Promise<void> {
    await previousSaved
    const contents = await Promise.all(DOCS.map((s) => readStage(id, s)))
    if (closed) return
    const opened = {} as Record<Doc, StageEditor>
    DOCS.forEach((s, i) => {
      const content = contents[i]
      if (content !== undefined) opened[s] = openStageEditor(id, s, content)
    })
    editors = opened
    for (const s of DOCS) {
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

  const all = () => (editors === null ? [] : DOCS.map((s) => editors?.[s] as StageEditor))

  return {
    navigate(route: Route) {
      if (route.name !== 'edit' || route.id !== id) return false
      show(route.stage)
      return true
    },
    async dispose() {
      clearBody()
      resizer.destroy()
      closed = true
      await Promise.all(all().map((editor) => editor.close()))
    },
    hasUnsavedChanges: () => all().some((editor) => editor.hasUnsavedChanges),
    flush: () => Promise.all(all().map((editor) => editor.flush())).then(() => {}),
  }
}
