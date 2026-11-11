import { type GuideTabKey, guideTabFor, RECOMMENDED_GUIDE_TAB } from '../shared/side-pane.js'
import type { Stage } from '../shared/types.js'
import { h } from './dom.js'
import { guideTabs } from './guide-content.js'

/**
 * 編集画面の学習ガイドの引き出し（`docs/plans/archive/right-pane-layout.md`）。
 *
 * - ヘッダの「学習ガイド」（`button`）で開け閉めし、右ペイン（AI）の上に同じ幅で重ねる。中央は隠さないので、
 *   書きながら見られて、下書き（STEP 3）を開いていれば表現集を押して本文に入れられる
 * - 中身は学習ガイド画面と同じ（`guide-content.ts`）。「別の画面で開く」で学習ガイド画面（`#/guide`）へ移る
 * - 編集画面を開いている間は 1 つを持ち続ける（段階を移っても開いたまま）
 * - 開くタブは段階に合わせる（`guideTabFor`。課題 = 構成、アウトライン = モデル文、下書き = 表現集。おすすめに「●」）。
 *   自分で選んだタブはその段階では覚える（このブラウザのタブを開いている間。パラグラフをまたいでも同じ）
 * - 表現集を押して本文に入れられるのは下書きの段階だけ。ほかの段階では見るだけの形にする
 */

/** 段階ごとに自分で選んだタブ。 */
const chosen: Partial<Record<Stage, GuideTabKey>> = {}

export interface GuideDrawer {
  /** 引き出し（`.panes` の中に置く）。 */
  el: HTMLElement
  /** ヘッダの「学習ガイド」。開いている間は押した見た目。 */
  button: HTMLButtonElement
  /** 段階を移ったら（その段階のタブを開き、表現集を押せるかを切り替える）。 */
  setStage(stage: Stage): void
}

export function createGuideDrawer(): GuideDrawer {
  let stage: Stage = 'assignment'
  const { tabs, body, select } = guideTabs(true, {
    insertable: () => stage === 'draft',
    recommended: () => RECOMMENDED_GUIDE_TAB[stage],
    onSelect: (tab) => {
      chosen[stage] = tab
    },
  })
  const close = h(
    'button',
    { class: 'drawer-x', type: 'button', title: '閉じる', 'aria-label': '学習ガイドを閉じる' },
    '×',
  )
  const el = h(
    'aside',
    { class: 'side drawer', id: 'guide-drawer', 'aria-label': '学習ガイド', hidden: true },
    h(
      'div',
      { class: 'drawer-head' },
      h('h2', {}, '学習ガイド'),
      h(
        'a',
        { class: 'drawer-page', href: '#/guide', title: '学習ガイドの画面へ移る' },
        '別の画面で開く',
      ),
      close,
    ),
    tabs,
    h('div', { class: 'gbody' }, body),
  )
  const button = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      'aria-controls': 'guide-drawer',
      'aria-expanded': 'false',
    },
    '学習ガイド',
  )
  let open = false
  const setOpen = (value: boolean) => {
    open = value
    el.hidden = !open
    button.classList.toggle('on', open)
    button.setAttribute('aria-expanded', String(open))
  }
  button.addEventListener('click', () => setOpen(!open))
  close.addEventListener('click', () => {
    setOpen(false)
    button.focus()
  })
  return {
    el,
    button,
    setStage(next) {
      stage = next
      select(guideTabFor(stage, chosen))
    },
  }
}
