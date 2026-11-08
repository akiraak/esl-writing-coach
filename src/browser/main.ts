import { parseRoute } from '../shared/route.js'
import { h, replace } from './dom.js'
import { header } from './ui.js'
import { STATIC_VIEW, type View } from './view.js'
import { renderEdit } from './views/edit.js'
import { renderGuide } from './views/guide.js'
import { renderList } from './views/list.js'

/**
 * 画面の入口。URL のハッシュで一覧・編集・学習ガイドを切り替える（`src/shared/route.ts`）。
 *
 * - 画面を切り替えるときは、前の画面の `dispose()` を呼ぶ（未保存があれば待たずに保存する）
 * - タブを閉じる・再読み込みするときに未保存があれば、保存を始めてブラウザの確認を出す
 */

const app = document.getElementById('app') as HTMLElement
let current: View = STATIC_VIEW
/** 画面を離れたときに始めた保存のうち、まだ終わっていないもの全部。 */
let pendingSaves: Promise<void> = Promise.resolve()

function renderNotFound(hash: string): View {
  replace(
    app,
    header(),
    h(
      'main',
      { class: 'lwrap' },
      h('p', {}, `ページがありません（${hash}）。`),
      h('a', { href: '#/' }, '一覧へ'),
    ),
  )
  return STATIC_VIEW
}

function render(): void {
  // 画面はすぐ切り替える。前の画面の保存は裏で続け、新しい画面は**まだ終わっていない保存を全部待ってから読み込む**
  // （待たずに読むと、保存前の古い rev で編集が始まり、次の保存が誤って競合になる。
  // 課題 → アイデア → 課題と素早く移ったときも、最初の課題の保存を待つよう、1 つ前だけでなく全部をつなぐ）
  const disposing = Promise.resolve(current.dispose()).catch(() => {})
  pendingSaves = Promise.all([pendingSaves, disposing]).then(() => {})
  const previousSaved = pendingSaves
  const route = parseRoute(location.hash)
  switch (route.name) {
    case 'list':
      current = renderList(app, previousSaved)
      break
    case 'edit':
      current = renderEdit(app, route.id, route.stage, render, previousSaved)
      break
    case 'guide':
      current = renderGuide(app)
      break
    case 'not-found':
      current = renderNotFound(route.hash)
      break
  }
}

window.addEventListener('hashchange', render)
window.addEventListener('beforeunload', (event) => {
  if (!current.hasUnsavedChanges()) return
  void current.flush()
  event.preventDefault()
})
render()
