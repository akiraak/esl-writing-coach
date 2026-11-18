import { parseRoute } from '../shared/route.js'
import { h, replace } from './dom.js'
import { onLangRequest, setLang, t } from './i18n.js'
import { header } from './ui.js'
import { STATIC_VIEW, type View } from './view.js'
import { renderEdit } from './views/edit.js'
import { renderGuide } from './views/guide.js'
import { renderList } from './views/list.js'
import { renderReview } from './views/review.js'

/**
 * 画面の入口。URL のハッシュで一覧・編集・学習ガイドを切り替える（`src/shared/route.ts`）。
 *
 * - 今の画面のまま移れるとき（編集画面の中で段階を移る）は `navigate()` に任せ、作り直さない
 * - 画面を切り替えるときは、前の画面の `dispose()` を呼ぶ（未保存があれば待たずに保存する）
 * - タブを閉じる・再読み込みするときに未保存があれば、保存を始めてブラウザの確認を出す
 * - 表示の言語を切り替えたら、未保存を保存してから今の画面を作り直す（`docs/plans/archive/ui-english.md`）
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
      h('p', {}, t().notFound.message(hash)),
      h('a', { href: '#/' }, t().notFound.toList),
    ),
  )
  return STATIC_VIEW
}

/** `rebuild` は今の画面のまま移れても作り直す（表示の言語を切り替えたとき）。 */
function render(rebuild = false): void {
  const route = parseRoute(location.hash)
  // 同じパラグラフの中で段階を移るときなどは、画面を作り直さない（ファイルを読み直さない）
  if (!rebuild && current.navigate?.(route) === true) return
  // 画面はすぐ切り替える。前の画面の保存は裏で続け、新しい画面は**まだ終わっていない保存を全部待ってから読み込む**
  // （待たずに読むと、保存前の古い rev で編集が始まり、次の保存が誤って競合になる。
  // 課題 → アウトライン → 課題と素早く移ったときも、最初の課題の保存を待つよう、1 つ前だけでなく全部をつなぐ）
  const disposing = Promise.resolve(current.dispose()).catch(() => {})
  pendingSaves = Promise.all([pendingSaves, disposing]).then(() => {})
  const previousSaved = pendingSaves
  switch (route.name) {
    case 'list':
      current = renderList(app, previousSaved)
      break
    case 'edit':
      current = renderEdit(app, route.id, route.stage, previousSaved)
      break
    case 'guide':
      current = renderGuide(app)
      break
    case 'review':
      current = renderReview(app, previousSaved)
      break
    case 'not-found':
      current = renderNotFound(route.hash)
      break
  }
}

window.addEventListener('hashchange', () => render())

/**
 * 表示の言語の切り替え。描いた文を差し替える仕組みは持たないので、画面を作り直す。
 * 先に未保存を保存し（作り直すと新しい画面はサーバから読み直す）、それでも残る変更（競合・保存の失敗）があれば確かめる。
 * AI の呼び出し中の結果はブラウザのメモリに持っているので、作り直した画面に出る。
 */
let switching = false
onLangRequest((lang) => {
  if (switching) return
  switching = true
  current
    .flush()
    .catch(() => {})
    .then(() => {
      if (current.hasUnsavedChanges() && !window.confirm(t().lang.unsavedConfirm)) return
      setLang(lang)
      render(true)
    })
    .finally(() => {
      switching = false
    })
})
// Ctrl+S（Mac は Cmd+S）でブラウザの「ページを保存」を出さない。自動保存なので要らないが、つい押すので、
// 未保存の分があればその場で保存する（`docs/plans/archive/disable-ctrl-s.md`）
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  void current.flush()
})
window.addEventListener('beforeunload', (event) => {
  if (!current.hasUnsavedChanges()) return
  void current.flush()
  event.preventDefault()
})
render()
