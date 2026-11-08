import { parseAssignment } from '../../shared/assignment.js'
import { routeHash } from '../../shared/route.js'
import { STAGES, type Stage, type StageContent } from '../../shared/types.js'
import { readStage } from '../api.js'
import { h, replace } from '../dom.js'
import { openStageEditor, type StageEditor } from '../stage-editor.js'
import { errorBox, header, STAGE_LABELS, STAGE_LANG } from '../ui.js'
import type { View } from '../view.js'
import { renderAssignmentView } from './assignment.js'

/**
 * 編集画面（3 ペイン）。左 = 段階のタイル、中央 = 選んだ段階の編集欄、右 = 学習ガイド。
 *
 * いま中身があるのは STEP 1（課題）だけ。ほかの段階は各タスクで作る（いまは保存されている内容を見せるだけ）。
 * パンくずには `assignment.md` のテーマを出す（どの段階でも）。
 */

export function renderEdit(
  app: HTMLElement,
  id: string,
  stage: Stage,
  reload: () => void,
  /** 前の画面の保存。終わってから読む（古い rev で編集を始めないため）。 */
  previousSaved: Promise<void>,
): View {
  const crumbTheme = h('b', {}, id)
  const status = h('span', { class: 'save-status' })
  const banner = h('div', { class: 'banner' })
  const body = h('div', { class: 'stage-body' }, h('p', { class: 'muted' }, '読み込み中…'))
  let editor: StageEditor | null = null
  let closed = false

  const setTheme = (theme: string) => replace(crumbTheme, theme === '' ? id : theme)

  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', crumbTheme)], [status]),
    h(
      'div',
      { class: 'panes' },
      h(
        'nav',
        { class: 'stages' },
        ...STAGES.map((s, i) =>
          h(
            'a',
            {
              class: `tile${s === stage ? ' on' : ''}`,
              href: routeHash({ name: 'edit', id, stage: s }),
            },
            h(
              'span',
              { class: `lang ${STAGE_LANG[s]}` },
              STAGE_LANG[s] === 'en' ? '英語のみ' : '日本語可',
            ),
            h('div', { class: 'k' }, `STEP ${i + 1}`),
            h('div', { class: 't' }, STAGE_LABELS[s]),
          ),
        ),
      ),
      h('main', { class: 'center' }, h('h2', {}, STAGE_LABELS[stage]), banner, body),
      h(
        'aside',
        { class: 'guide' },
        h(
          'div',
          { class: 'seg' },
          h('span', { class: 'on' }, '構成'),
          h('span', {}, 'モデル文'),
          h('span', {}, '表現集'),
        ),
        h('div', { class: 'gbody muted' }, '学習ガイドは「学習ガイド」のタスクで作ります。'),
      ),
    ),
  )

  const load = async () => {
    await previousSaved
    // 課題は、パンくずのテーマのためにどの段階でも読む
    const [assignment, content] = await Promise.all([
      readStage(id, 'assignment'),
      stage === 'assignment' ? null : readStage(id, stage),
    ])
    if (closed) return
    setTheme(parseAssignment(assignment.text).theme)
    const own: StageContent = content ?? assignment
    if (stage === 'assignment') {
      editor = openStageEditor({ id, stage, content: own, status, banner, reload })
      renderAssignmentView(body, { text: own.text, editor, onThemeChange: setTheme })
    } else {
      // 編集欄は各段階のタスクで作る。いまは保存されている内容を見せるだけ
      replace(
        body,
        own.rev === null
          ? h('p', { class: 'muted' }, 'まだ何も書かれていません。')
          : h('pre', { class: 'preview' }, own.text),
      )
    }
  }
  load().catch((error: unknown) => {
    if (!closed) replace(body, errorBox(error))
  })

  return {
    async dispose() {
      closed = true
      await editor?.close()
    },
    hasUnsavedChanges: () => editor?.hasUnsavedChanges ?? false,
    flush: () => editor?.autosave.flush() ?? Promise.resolve(),
  }
}
