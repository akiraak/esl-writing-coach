import { routeHash } from '../../shared/route.js'
import { type ParagraphListItem, STAGES } from '../../shared/types.js'
import { createParagraph, deleteParagraph, listParagraphs } from '../api.js'
import { h, replace } from '../dom.js'
import { errorBox, errorText, formatDate, header, STAGE_SHORT_LABELS } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/**
 * 一覧画面。パラグラフのカード（テーマ・4 段階の進み具合・更新日・削除）と新規作成。
 *
 * - カード全体が編集画面（課題）へのリンク。`<a>` の中にボタンを入れないよう、タイトルのリンクを CSS でカード全体に広げ、
 *   削除ボタンはその上に出す
 * - 新規作成はダイアログでテーマを聞き、作ったら課題の画面を開く（テーマは空でもよい）
 */
export function renderList(app: HTMLElement, previousSaved: Promise<void>): View {
  const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, '読み込み中…'))
  const newCard = h(
    'button',
    { class: 'pc new', type: 'button', onclick: () => openCreateDialog(app) },
    '＋ 新しいパラグラフ',
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
        h('h1', {}, 'パラグラフ'),
        h('span', { class: 'sp' }),
        h(
          'button',
          { class: 'btn pri', type: 'button', onclick: () => openCreateDialog(app) },
          '＋ 新規作成',
        ),
      ),
      grid,
    ),
  )
  previousSaved.then(listParagraphs).then(
    (list) => {
      const empty = h('p', { class: 'muted empty' }, 'まだパラグラフはありません。')
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
  const remove = h('button', { class: 'x', type: 'button' }, '削除')
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
    h('div', { class: 'plabels' }, ...STAGES.map((s) => h('span', {}, STAGE_SHORT_LABELS[s]))),
    h('div', { class: 'meta' }, h('span', {}, `更新 ${formatDate(p.updatedAt)}`), remove),
  )
  remove.addEventListener('click', () => {
    const ok = window.confirm(
      `「${title}」を削除しますか？\n\nフォルダごと消します（Dropbox の削除済みファイルから戻せます）。`,
    )
    if (!ok) return
    remove.disabled = true
    replace(remove, '削除中…')
    deleteParagraph(p.id).then(
      () => {
        el.remove()
        onRemoved()
      },
      (error: unknown) => {
        remove.disabled = false
        replace(remove, '削除')
        window.alert(`削除できません: ${errorText(error)}`)
      },
    )
  })
  return el
}

/** テーマを聞いて新規作成し、課題の画面を開く。 */
function openCreateDialog(app: HTMLElement): void {
  const theme = h('input', {
    class: 'theme-input',
    type: 'text',
    maxlength: 300,
    placeholder: 'Should students wear school uniforms?',
    'aria-label': 'テーマ',
  })
  const message = h('p', { class: 'error' })
  const submit = h('button', { class: 'btn pri', type: 'submit' }, '作成')
  const cancel = h('button', { class: 'btn', type: 'button' }, 'やめる')
  let busy = false

  const form = h(
    'form',
    { class: 'create-form' },
    h('h2', {}, '新しいパラグラフ'),
    h('label', { class: 'field-label' }, 'テーマ'),
    theme,
    h(
      'p',
      { class: 'hint' },
      '自分で決めたテーマ（問い）。英語でも日本語でもよい。空のままでも作れ、あとで課題の画面で入れられる。',
    ),
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
    replace(submit, '作成中…')
    createParagraph(theme.value.trim()).then(
      (id) => {
        close()
        location.hash = routeHash({ name: 'edit', id, stage: 'assignment' })
      },
      (error: unknown) => {
        busy = false
        submit.disabled = false
        cancel.disabled = false
        replace(submit, '作成')
        replace(message, `作成できません: ${errorText(error)}`)
      },
    )
  })

  app.append(dialog)
  dialog.showModal()
  theme.focus()
}
