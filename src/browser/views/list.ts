import { routeHash } from '../../shared/route.js'
import { type ParagraphListItem, STAGES } from '../../shared/types.js'
import { createParagraph, deleteParagraph, listParagraphs } from '../api.js'
import { h, replace } from '../dom.js'
import { t } from '../i18n.js'
import { errorBox, errorText, formatDate, header, stageShortLabel } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/**
 * 一覧画面。パラグラフのカード（テーマ・4 段階の進み具合・更新日・削除）と新規作成。
 *
 * - カード全体が編集画面（課題）へのリンク。`<a>` の中にボタンを入れないよう、タイトルのリンクを CSS でカード全体に広げ、
 *   削除ボタンはその上に出す
 * - 新規作成はダイアログでテーマを聞き、作ったら課題の画面を開く（テーマは空でもよい）
 */
export function renderList(app: HTMLElement, previousSaved: Promise<void>): View {
  const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, t().loading))
  const newCard = h(
    'button',
    { class: 'pc new', type: 'button', onclick: () => openCreateDialog(app) },
    t().list.newCard,
  )
  replace(
    app,
    header(),
    h(
      'main',
      { class: 'lwrap' },
      h(
        'div',
        { class: 'lhead' },
        h('h1', {}, t().list.title),
        h('span', { class: 'sp' }),
        h(
          'button',
          { class: 'btn pri', type: 'button', onclick: () => openCreateDialog(app) },
          t().list.create,
        ),
      ),
      grid,
    ),
  )
  previousSaved.then(listParagraphs).then(
    (list) => {
      const empty = h('p', { class: 'muted empty' }, t().list.empty)
      const cards = list.map((p) =>
        card(p, () => {
          if (grid.querySelector('.pc:not(.new)') === null) grid.prepend(empty)
        }),
      )
      replace(grid, ...(cards.length === 0 ? [empty] : cards), newCard)
    },
    (error: unknown) => replace(grid, errorBox(error)),
  )
  return STATIC_VIEW
}

function card(p: ParagraphListItem, onRemoved: () => void): HTMLElement {
  const title = p.theme === '' ? p.id : p.theme
  const remove = h('button', { class: 'x', type: 'button' }, t().list.remove)
  const el = h(
    'div',
    { class: 'pc' },
    h(
      'h2',
      { class: p.theme === '' ? 'untitled' : '' },
      h(
        'a',
        { class: 'pc-link', href: routeHash({ name: 'edit', id: p.id, stage: 'assignment' }) },
        title,
      ),
    ),
    h(
      'div',
      { class: 'prog' },
      ...STAGES.map((s) => h('span', { class: p.started[s] ? 'f' : '' })),
    ),
    h('div', { class: 'plabels' }, ...STAGES.map((s) => h('span', {}, stageShortLabel(s)))),
    scoreLine(p),
    h('div', { class: 'meta' }, h('span', {}, t().list.updated(formatDate(p.updatedAt))), remove),
  )
  remove.addEventListener('click', () => {
    const ok = window.confirm(t().list.removeConfirm(title))
    if (!ok) return
    remove.disabled = true
    replace(remove, t().list.removing)
    deleteParagraph(p.id).then(
      () => {
        el.remove()
        onRemoved()
      },
      (error: unknown) => {
        remove.disabled = false
        replace(remove, t().list.remove)
        window.alert(t().list.removeFailed(errorText(error)))
      },
    )
  })
  return el
}

/** 最新の採点（合計・採点した日・採点の後に変わった印）。採点していなければ空の行で高さだけそろえる。 */
function scoreLine(p: ParagraphListItem): HTMLElement {
  const score = p.score
  if (score === null) return h('div', { class: 'pscore' })
  return h(
    'div',
    { class: 'pscore' },
    h('span', { class: 'pscore-total' }, h('b', {}, String(score.total)), ' / 100'),
    score.scoredAt === '' ? '' : h('span', {}, t().list.scored(formatDate(score.scoredAt))),
    score.stale ? h('span', { class: 'pscore-stale' }, t().list.staleScore) : '',
  )
}

/** テーマを聞いて新規作成し、課題の画面を開く。 */
function openCreateDialog(app: HTMLElement): void {
  const theme = h('input', {
    class: 'theme-input',
    type: 'text',
    maxlength: 300,
    placeholder: 'Should students wear school uniforms?',
    'aria-label': t().list.theme,
  })
  const message = h('p', { class: 'error' })
  const submit = h('button', { class: 'btn pri', type: 'submit' }, t().list.submit)
  const cancel = h('button', { class: 'btn', type: 'button' }, t().list.cancel)
  let busy = false

  const form = h(
    'form',
    { class: 'create-form' },
    h('h2', {}, t().list.dialogTitle),
    h('label', { class: 'field-label' }, t().list.theme),
    theme,
    h('p', { class: 'hint' }, t().list.themeHint),
    message,
    h('div', { class: 'actions' }, cancel, submit),
  )
  const dialog = h('dialog', { class: 'create-dialog' }, form)

  const close = () => {
    dialog.close()
    dialog.remove()
  }
  cancel.addEventListener('click', close)
  // Esc で閉じたとき（作成中は閉じさせない）
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault()
  })
  dialog.addEventListener('close', () => dialog.remove())
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (busy) return
    busy = true
    submit.disabled = true
    cancel.disabled = true
    replace(message)
    replace(submit, t().list.submitting)
    createParagraph(theme.value.trim()).then(
      (id) => {
        close()
        location.hash = routeHash({ name: 'edit', id, stage: 'assignment' })
      },
      (error: unknown) => {
        busy = false
        submit.disabled = false
        cancel.disabled = false
        replace(submit, t().list.submit)
        replace(message, t().list.createFailed(errorText(error)))
      },
    )
  })

  app.append(dialog)
  dialog.showModal()
  theme.focus()
}
