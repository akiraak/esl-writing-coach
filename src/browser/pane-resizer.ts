import {
  clampPaneWidth,
  maxPaneWidth,
  PANE_WIDTH,
  parseStoredPaneWidth,
} from '../shared/side-pane.js'
import { h } from './dom.js'

/**
 * 編集画面の右ペインの幅を変える境（右ペインの左端。`docs/plans/archive/right-pane-layout.md` の Phase 4）。
 *
 * - ドラッグで 300〜560px（狭い画面では中央が 560px 残るまで上限を下げる。`maxPaneWidth`）。学習ガイドの引き出しも同じ幅
 * - ダブルクリックで既定（340px）に戻す。フォーカスして ← → で 20px ずつ（← で広げる）
 * - 変えた幅はブラウザに覚える（`localStorage`。読めなくても既定で動く）。画面が狭くなって収めた幅は覚えず、広げれば戻る
 * - 幅は `.panes` の `--right` に入れる（グリッドの右の列と引き出しが使う）。マップは `ResizeObserver` で枠に合わせる
 */

const STORAGE_KEY = 'esl-writing.pane-width'

function loadWidth(): number {
  try {
    return parseStoredPaneWidth(localStorage.getItem(STORAGE_KEY)) ?? PANE_WIDTH.default
  } catch {
    return PANE_WIDTH.default
  }
}

function saveWidth(width: number): void {
  try {
    if (width === PANE_WIDTH.default) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // 覚えられなくても幅は変えられる
  }
}

export interface PaneResizer {
  el: HTMLElement
  /** 画面を離れるとき（`ResizeObserver` を外す）。 */
  destroy(): void
}

export function mountPaneResizer(panes: HTMLElement): PaneResizer {
  /** 使いたい幅（覚えた幅）。画面が狭いときは収めて描くが、この値は変えない。 */
  let wanted = loadWidth()
  const el = h('div', {
    class: 'pane-resizer',
    role: 'separator',
    tabindex: 0,
    'aria-orientation': 'vertical',
    'aria-label': '右ペインの幅',
    title: 'ドラッグで右ペインの幅を変える（ダブルクリックで戻す・← → でも動く）',
  })

  const apply = () => {
    const panesWidth = panes.clientWidth
    const width = clampPaneWidth(wanted, panesWidth)
    panes.style.setProperty('--right', `${width}px`)
    el.setAttribute('aria-valuemin', String(PANE_WIDTH.min))
    el.setAttribute('aria-valuemax', String(maxPaneWidth(panesWidth)))
    el.setAttribute('aria-valuenow', String(width))
  }
  const setWanted = (width: number) => {
    wanted = clampPaneWidth(width, panes.clientWidth)
    apply()
  }

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    el.setPointerCapture(event.pointerId)
    el.classList.add('drag')
    document.body.classList.add('resizing')
    const right = panes.getBoundingClientRect().right
    const move = (e: PointerEvent) => setWanted(right - e.clientX)
    const up = () => {
      el.classList.remove('drag')
      document.body.classList.remove('resizing')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      saveWidth(wanted)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  })
  el.addEventListener('dblclick', () => {
    setWanted(PANE_WIDTH.default)
    saveWidth(wanted)
  })
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const current = clampPaneWidth(wanted, panes.clientWidth)
    setWanted(current + (event.key === 'ArrowLeft' ? PANE_WIDTH.step : -PANE_WIDTH.step))
    saveWidth(wanted)
  })

  // 画面の大きさが変わったら収め直す（最初に置いたときも呼ばれる）
  const observer = new ResizeObserver(apply)
  observer.observe(panes)
  return { el, destroy: () => observer.disconnect() }
}
