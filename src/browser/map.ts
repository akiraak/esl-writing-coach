import {
  layoutMindmap,
  type MindmapLayout,
  type PlacedNode,
  wrapLabel,
} from '../shared/mindmap-layout.js'
import {
  addChild,
  addSibling,
  copyText,
  findNode,
  indentNode,
  lineMapper,
  moveAmongSiblings,
  moveNode,
  type Outline,
  type OutlineEdit,
  type OutlineNode,
  outdentNode,
  parentOf,
  parseOutline,
  pasteNodes,
  removeNode,
  renameNode,
} from '../shared/outline.js'

/**
 * マインドマップの部品: 字下げのテキストを木として図で見せて編集する。
 * daily-note の `src/browser/map.ts`（1b79b04）から移植した（`docs/plans/archive/outline-mindmap.md`）。
 *
 * - **正は字下げのテキスト**。図の操作は `src/shared/outline.ts` の関数で該当する行だけを書き換え、`onChange(text)` で渡す
 *   （daily-note は隠した textarea に書き戻していた。ここでは段階の自動保存へ渡す）
 * - 座標は保存しない（開くたび・操作のたびに並べ直す）。畳んだ状態・元に戻すの履歴もこの部品の中だけ
 * - 移植で外したもの: 英単語の綴りの確認、画像の書き出し、AI に送る範囲の知らせ、タッチ操作（PC 専用のため）
 * - `document` に付けるリスナ（コピー・貼り付け）と `ResizeObserver` は `destroy()` で外す（段階を移るたびに作り直すため）
 */

export interface MapOptions {
  /** 開いたときの本文（LF に正規化済み）。 */
  text: string
  /** 仮の中心（字下げ 0 の行が 0 個・2 個以上のとき）の名前。 */
  title: string
  /** 本文が空のとき、中心の名前の入力欄に出す例。 */
  centerPlaceholder: string
  /** 図の操作で本文が変わったら。 */
  onChange(text: string): void
  /**
   * 選んでいる項目が変わったら・描き直したら（アウトラインの画面の問いの行）。`text` は入力欄を出している間は仮の枝を入れた本文で、
   * `line` はその本文での行（仮の中心は -1）。
   */
  onSelect?(selection: { text: string; line: number }): void
}

export interface MapHandle {
  destroy(): void
}

const SVG = 'http://www.w3.org/2000/svg'
/** 図の外側の余白（px）。 */
const MARGIN = 24
/** ノードの枠の内側の余白（px）。 */
const PAD_X = 10
const PAD_Y = 6
/** 名前を折り返す桁（全角 20 字）。 */
const WRAP_COLUMNS = 40
/** 畳んだノードの右に出す「+3」の幅（px）。 */
const BADGE_GAP = 6
/** 新しく足すノードを並べるときの仮の名前（並べるためだけに使い、本文には書かない）。 */
const DRAFT_LABEL = '新しい枝'
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.5
const UNDO_LIMIT = 200
/** マウスでこれだけ動いたらドラッグ（px）。 */
const DRAG_SLOP = 5

interface Snapshot {
  text: string
  selected: number
}

/** 名前の入力欄を出している間の状態。`apply` が本文の書き換えを作る。 */
interface Draft {
  /** 並べるための本文（新しく足すときは仮の名前の枝が入っている）。 */
  text: string
  line: number
  initial: string
  /** やめたときに選び直すノード。 */
  back: number
  /** 開いたときに名前を全部選ぶか（置き換え向け）、カーソルを末尾に置くか（書き足し向け）。 */
  caret: 'all' | 'end'
  apply(label: string): OutlineEdit | null
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function countDescendants(node: OutlineNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

export function mountMap(host: HTMLElement, options: MapOptions): MapHandle {
  const { title } = options
  /** 外すもの（destroy で呼ぶ）。 */
  const cleanups: (() => void)[] = []

  const scroller = document.createElement('div')
  scroller.className = 'map-scroll'
  scroller.tabIndex = 0
  scroller.setAttribute('role', 'tree')
  scroller.setAttribute('aria-label', 'マインドマップ')
  const svg = el('svg', { class: 'map-svg' })
  // 名前の入力欄。Shift+Enter で改行を入れられるよう textarea（本文には行末の \ で続けて書く。outline.ts）
  const input = document.createElement('textarea')
  input.className = 'map-input'
  input.hidden = true
  input.spellcheck = false
  input.rows = 1
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('aria-label', 'ノードの名前（Shift+Enter で改行）')
  // 選んだノードへの操作のボタン。キーの早見も添える
  const bar = document.createElement('div')
  bar.className = 'map-bar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'マップの操作')
  const button = (label: string, tip: string): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'map-act'
    b.textContent = label
    b.title = tip
    // 押してもフォーカスを図から奪わない（続けてキーで操作できるように）
    b.addEventListener('pointerdown', (event) => event.preventDefault())
    bar.append(b)
    return b
  }
  const addChildButton = button('＋子', '子を足す（Tab）')
  const addSiblingButton = button('＋兄弟', '兄弟を足す（Enter）')
  const renameButton = button('名前', '名前を変える（Space・F2・ダブルクリック）')
  const removeButton = button('削除', '消す（Delete）')
  const toggleButton = button('畳む', '畳む・開く（Ctrl+↑ / Ctrl+↓）')
  const undoButton = button('↶', '元に戻す（Ctrl+Z）')
  const redoButton = button('↷', 'やり直す（Ctrl+Shift+Z）')
  const zoomOutButton = button('－', '縮小（Ctrl+-）')
  const zoomInButton = button('＋', '拡大（Ctrl++）')
  const hint = document.createElement('span')
  hint.className = 'map-hint'
  hint.textContent =
    'Tab: 子 / Enter: 兄弟 / Space: 名前 / Delete: 消す / Alt+矢印・ドラッグ: 付け替え / Ctrl+↑↓: 畳む・開く / Ctrl+C・X・V: 枝のコピー'
  bar.append(hint)
  scroller.append(svg, input)
  host.append(scroller, bar)

  let text = options.text
  let selected = 0
  let collapsed = new Set<number>()
  /** 描くときの畳み（入力欄を出している間は、仮の枝のぶん行をずらしたもの）。 */
  let shown = collapsed
  let zoom = 1
  let draft: Draft | null = null
  let outline: Outline = parseOutline(text, title)
  let layout: MindmapLayout = { nodes: [], edges: [], width: 0, height: 0 }
  const undo: Snapshot[] = []
  const redo: Snapshot[] = []
  /** Esc の次の Tab はフォーカスの移動に使う（キーボードだけの人を閉じ込めない）。 */
  let escaped = false
  let destroyed = false

  // --- 文字の大きさを測る ---

  const canvas = document.createElement('canvas').getContext('2d')
  let font = { size: 14, family: 'sans-serif', row: 20 }
  function readFont(): void {
    const style = getComputedStyle(scroller)
    const size = Number.parseFloat(style.fontSize) || 14
    font = { size, family: style.fontFamily || 'sans-serif', row: Math.round(size * 1.4) }
    if (canvas !== null) canvas.font = `${size}px ${font.family}`
  }
  function measure(row: string): number {
    return canvas === null ? Array.from(row).length * font.size : canvas.measureText(row).width
  }

  /** 図に出す行。名前の中の改行で分け、長い行は折り返す。 */
  function rowsOf(node: OutlineNode): string[] {
    return node.label.split('\n').flatMap((row) => wrapLabel(row, WRAP_COLUMNS))
  }

  function badgeOf(node: OutlineNode): string | null {
    return shown.has(node.line) && node.children.length > 0 ? `+${countDescendants(node)}` : null
  }

  // --- 描く ---

  function render(): void {
    outline = parseOutline(draft?.text ?? text, title)
    if (draft === null) {
      // 子の無くなった行の畳みは捨てる
      collapsed = new Set([...collapsed].filter((line) => findNode(outline, line)?.children.length))
      shown = collapsed
    } else {
      const map = lineMapper(text, draft.text)
      shown = new Set([...collapsed].flatMap((line) => map(line) ?? []))
    }
    if (findNode(outline, selected) === null) selected = outline.root.line
    layout = layoutMindmap(
      outline.root,
      (node) => {
        const rows = rowsOf(node)
        const badge = badgeOf(node)
        // 中心は太字で描くので、測るときも太字で
        if (canvas !== null && node === outline.root)
          canvas.font = `700 ${font.size}px ${font.family}`
        const width =
          Math.max(...rows.map(measure), font.size) +
          PAD_X * 2 +
          (badge === null ? 0 : measure(badge) + BADGE_GAP + PAD_X)
        if (canvas !== null && node === outline.root) canvas.font = `${font.size}px ${font.family}`
        return { width: Math.ceil(width), height: rows.length * font.row + PAD_Y * 2 }
      },
      shown,
      { gapX: Math.round(font.size * 2.6), gapY: Math.round(font.size * 0.6) },
    )

    const width = layout.width + MARGIN * 2
    const height = layout.height + MARGIN * 2
    svg.setAttribute('viewBox', `${-MARGIN} ${-MARGIN} ${width} ${height}`)
    svg.setAttribute('width', String(Math.ceil(width * zoom)))
    svg.setAttribute('height', String(Math.ceil(height * zoom)))

    const edges = el('g', { class: 'map-edges' })
    for (const edge of layout.edges) {
      const middle = (edge.fromX + edge.toX) / 2
      edges.append(
        el('path', {
          class: 'map-edge',
          d: `M${edge.fromX} ${edge.fromY}C${middle} ${edge.fromY} ${middle} ${edge.toY} ${edge.toX} ${edge.toY}`,
        }),
      )
    }
    const nodes = el('g', { class: 'map-nodes' })
    for (const placed of layout.nodes) {
      const node = findNode(outline, placed.line)
      if (node !== null) nodes.append(drawNode(node, placed))
    }
    svg.replaceChildren(edges, nodes)
    scroller.setAttribute('aria-activedescendant', `map-node-${selected}`)
    updateBar()
  }

  function updateBar(): void {
    const node = findNode(outline, selected)
    const empty = outline.root.line === -1 && outline.root.children.length === 0
    addChildButton.disabled = node === null
    addSiblingButton.disabled = node === null || empty
    renameButton.disabled = node === null || (node.line === -1 && node.children.length > 0)
    removeButton.disabled = node === null || node === outline.root
    toggleButton.disabled = node === null || node.children.length === 0
    toggleButton.textContent = node !== null && shown.has(node.line) ? '開く' : '畳む'
    undoButton.disabled = undo.length === 0
    redoButton.disabled = redo.length === 0
    options.onSelect?.({ text: draft?.text ?? text, line: selected })
    zoomOutButton.disabled = zoom <= ZOOM_MIN
    zoomInButton.disabled = zoom >= ZOOM_MAX
  }

  function drawNode(node: OutlineNode, placed: PlacedNode): SVGGElement {
    const classes = ['map-node']
    if (node === outline.root) classes.push('root')
    if (node.line === -1) classes.push('virtual')
    if (placed.line === selected) classes.push('sel')
    if (draft !== null && placed.line === draft.line) classes.push('drafting')
    const g = el('g', {
      class: classes.join(' '),
      id: `map-node-${placed.line}`,
      role: 'treeitem',
      'aria-level': placed.depth + 1,
      'aria-selected': String(placed.line === selected),
      'data-line': placed.line,
      transform: `translate(${placed.x} ${placed.y})`,
    })
    if (node.children.length > 0) g.setAttribute('aria-expanded', String(!shown.has(node.line)))
    g.append(el('rect', { class: 'map-box', width: placed.width, height: placed.height, rx: 6 }))
    const label = el('text', { class: 'map-label' })
    rowsOf(node).forEach((row, index) => {
      const span = el('tspan', {
        x: PAD_X,
        y: PAD_Y + (index + 0.5) * font.row,
        'dominant-baseline': 'central',
      })
      span.textContent = row
      label.append(span)
    })
    g.append(label)
    const badge = badgeOf(node)
    if (badge !== null) {
      const badgeText = el('text', {
        class: 'map-badge',
        x: placed.width - PAD_X,
        y: placed.height / 2,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
      })
      badgeText.textContent = badge
      g.append(badgeText)
    }
    return g
  }

  function placedOf(line: number): PlacedNode | undefined {
    return layout.nodes.find((node) => node.line === line)
  }

  /** 選んだノードを画面に入れる（端から少し離して）。 */
  function reveal(line: number): void {
    const placed = placedOf(line)
    if (placed === undefined) return
    const left = (placed.x + MARGIN) * zoom
    const top = (placed.y + MARGIN) * zoom
    const right = left + placed.width * zoom
    const bottom = top + placed.height * zoom
    const slack = 24
    if (left - slack < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left - slack)
    else if (right + slack > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = right + slack - scroller.clientWidth
    if (top - slack < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - slack)
    else if (bottom + slack > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom + slack - scroller.clientHeight
  }

  /**
   * 選ぶ。並びは変わらないので**描き直さず、印だけを付け替える**（描き直すと要素が入れ替わり、
   * 2 回目のクリックが別の要素に当たってダブルクリックにならない）。
   */
  function select(line: number): void {
    if (findNode(outline, line) === null) return
    selected = line
    for (const g of svg.querySelectorAll<SVGGElement>('.map-node')) {
      const on = g.getAttribute('data-line') === String(line)
      g.classList.toggle('sel', on)
      g.setAttribute('aria-selected', String(on))
    }
    scroller.setAttribute('aria-activedescendant', `map-node-${selected}`)
    updateBar()
    reveal(line)
  }

  // --- 本文の書き換え ---

  function commit(edit: OutlineEdit | null, keepCollapsed: number | null = null): boolean {
    if (edit === null || edit.text === text) return false
    undo.push({ text, selected })
    if (undo.length > UNDO_LIMIT) undo.shift()
    redo.length = 0
    const map = lineMapper(text, edit.text)
    const next = new Set<number>()
    for (const line of collapsed) {
      const mapped = line === keepCollapsed ? edit.line : map(line)
      if (mapped !== null) next.add(mapped)
    }
    collapsed = next
    text = edit.text
    options.onChange(text)
    selected = edit.line
    render()
    reveal(selected)
    return true
  }

  function restore(from: Snapshot[], to: Snapshot[]): void {
    const snapshot = from.pop()
    if (snapshot === undefined) return
    to.push({ text, selected })
    // 行で覚えている畳みは、元に戻すと行がずれるので捨てる
    collapsed = new Set()
    text = snapshot.text
    options.onChange(text)
    selected = snapshot.selected
    render()
    reveal(selected)
  }

  // --- 名前の入力欄 ---

  function openDraft(next: Draft): void {
    draft = next
    selected = next.line
    render()
    reveal(next.line)
    const placed = placedOf(next.line)
    if (placed === undefined) {
      draft = null
      render()
      return
    }
    input.value = next.initial
    input.placeholder = text.trim() === '' ? options.centerPlaceholder : ''
    input.style.left = `${(placed.x + MARGIN) * zoom}px`
    input.style.top = `${(placed.y + MARGIN) * zoom}px`
    input.style.minWidth = `${Math.max(placed.width, text.trim() === '' ? 260 : 160) * zoom}px`
    input.style.height = `${placed.height * zoom}px`
    input.style.lineHeight = `${font.row * zoom}px`
    input.style.paddingTop = input.style.paddingBottom = `${PAD_Y * zoom}px`
    input.style.fontSize = `${font.size * zoom}px`
    input.hidden = false
    fitInput()
    input.focus()
    if (next.caret === 'all') input.select()
    else input.setSelectionRange(input.value.length, input.value.length)
  }

  /**
   * 入力欄を閉じる。`accept` なら打った名前で書き換える（空なら何もしない）。
   * `refocus` なら図にフォーカスを戻す（入力欄の外を押して閉じたときは、押した先のフォーカスを奪わない）。
   */
  function closeDraft(accept: boolean, refocus = true): void {
    const current = draft
    if (current === null) return
    draft = null
    input.hidden = true
    const label = input.value
    const keep = current.line === selected && collapsed.has(current.line) ? current.line : null
    const changed = accept && commit(current.apply(label), keep)
    if (!changed) {
      selected = current.back
      render()
    }
    if (refocus) scroller.focus({ preventScroll: true })
  }

  /**
   * 名前の入力欄を出す。`initial` を渡せばその文字から（打ち始めたとき）。`caret` は F2・ダブルクリックが全選択、
   * Space が末尾（今の名前に書き足す）。
   */
  function startRename(line: number, initial?: string, caret: 'all' | 'end' = 'all'): void {
    const node = findNode(outline, line)
    if (node === null) return
    // 仮の中心は、本文が空のときだけ名前（＝ 1 行目）を書ける
    if (node.line === -1 && node.children.length > 0) return
    openDraft({
      text,
      line,
      initial: initial ?? (node.line === -1 ? '' : node.label),
      back: line,
      caret,
      apply: (label) => renameNode(text, line, label),
    })
  }

  function startAdd(kind: 'child' | 'sibling'): void {
    const node = findNode(outline, selected)
    if (node === null) return
    // 本文が空（中心がまだ無い）なら、まず中心の名前
    if (node.line === -1 && node.children.length === 0) {
      startRename(-1)
      return
    }
    const make = kind === 'child' ? addChild : addSibling
    const shaped = make(text, selected, DRAFT_LABEL)
    if (shaped === null) return
    // 畳んでいるノードに子を足すときは開く
    if (kind === 'child' || selected === outline.root.line) collapsed.delete(selected)
    const from = selected
    openDraft({
      text: shaped.text,
      line: shaped.line,
      initial: '',
      back: from,
      caret: 'end',
      apply: (label) => make(text, from, label),
    })
  }

  /** 入力欄の高さを、打った行数に合わせて伸ばす（縮めるのはノードの高さまで）。 */
  function fitInput(): void {
    const placed = draft === null ? undefined : placedOf(draft.line)
    const rows = input.value.split('\n').length
    const height = Math.max(placed?.height ?? 0, rows * font.row + PAD_Y * 2) * zoom
    input.style.height = `${height}px`
  }
  input.addEventListener('input', fitInput)

  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return
    if (event.key === 'Enter' && event.shiftKey) {
      // 改行（textarea の既定の動き）。高さは input で合わせる
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      closeDraft(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeDraft(false)
    } else if (event.key === 'Tab') {
      // 名前を確定して、続けて子（Shift なら兄弟）を足す
      event.preventDefault()
      closeDraft(true)
      startAdd(event.shiftKey ? 'sibling' : 'child')
    }
  })
  input.addEventListener('blur', () => {
    if (!destroyed) closeDraft(true, false)
  })

  // --- キー操作 ---

  /** 上下: 同じ段のノードのうち、縦にいちばん近いもの（兄弟が先に当たる）。 */
  function neighbor(step: -1 | 1): number | null {
    const current = placedOf(selected)
    if (current === undefined) return null
    const center = current.y + current.height / 2
    let best: PlacedNode | null = null
    for (const node of layout.nodes) {
      if (node.depth !== current.depth || node === current) continue
      const y = node.y + node.height / 2
      if ((y - center) * step <= 0) continue
      if (best === null || Math.abs(y - center) < Math.abs(best.y + best.height / 2 - center))
        best = node
    }
    return best?.line ?? null
  }

  /** 畳む（`true`）・開く（`false`）。省略は今と逆。子の無いノードは何もしない。 */
  function toggle(line: number, fold = !collapsed.has(line)): void {
    const node = findNode(outline, line)
    if (node === null || node.children.length === 0 || collapsed.has(line) === fold) return
    if (fold) collapsed.add(line)
    else collapsed.delete(line)
    render()
    reveal(line)
  }

  scroller.addEventListener('keydown', (event) => {
    if (event.target !== scroller || event.isComposing) return
    const mod = event.ctrlKey || event.metaKey
    if (event.key === 'Escape') {
      escaped = true
      return
    }
    if (event.key === 'Tab' && escaped) {
      escaped = false
      return
    }
    escaped = false
    let handled = true
    const key = event.key
    if (mod && !event.altKey && (key === 'z' || key === 'Z')) {
      if (event.shiftKey) restore(redo, undo)
      else restore(undo, redo)
    } else if (mod && key === 'y') {
      restore(redo, undo)
    } else if (mod && !event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      // 畳む・開く（Workflowy などのアウトライナーと同じ。Mac は Cmd）
      toggle(selected, key === 'ArrowUp')
    } else if (mod && (key === '=' || key === '+' || key === '-' || key === '0')) {
      setZoom(key === '0' ? 1 : zoom * (key === '-' ? 1 / 1.2 : 1.2))
    } else if (mod) {
      handled = false
    } else if (event.altKey && key === 'ArrowUp') {
      commit(moveAmongSiblings(text, selected, -1))
    } else if (event.altKey && key === 'ArrowDown') {
      commit(moveAmongSiblings(text, selected, 1))
    } else if (event.altKey && key === 'ArrowRight') {
      commit(indentNode(text, selected))
    } else if (event.altKey && key === 'ArrowLeft') {
      commit(outdentNode(text, selected))
    } else if (key === 'Tab' && !event.shiftKey) {
      startAdd('child')
    } else if (key === 'Enter' && !event.shiftKey) {
      startAdd('sibling')
    } else if (key === 'F2') {
      startRename(selected)
    } else if (key === 'Delete' || key === 'Backspace') {
      commit(removeNode(text, selected))
    } else if (key === ' ') {
      // 名前の編集。いちばん押しやすいキーを、いちばんよく使う操作に（XMind などと同じ）。今の名前に書き足す
      startRename(selected, undefined, 'end')
    } else if (key === 'ArrowLeft') {
      const parent = parentOf(outline, selected)
      if (parent !== null) select(parent.line)
    } else if (key === 'ArrowRight') {
      const node = findNode(outline, selected)
      if (node !== null && collapsed.has(node.line)) toggle(node.line)
      else if (node?.children[0] !== undefined) select(node.children[0].line)
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const line = neighbor(key === 'ArrowUp' ? -1 : 1)
      if (line !== null) select(line)
    } else if (key === 'Home') {
      select(outline.root.line)
    } else if (!event.altKey && (key.length === 1 || key === 'Process')) {
      // 文字を打ち始めたら名前を打ち直す（打った文字は入力欄に入る）
      startRename(selected, '')
      handled = false
    } else {
      handled = false
    }
    if (handled) event.preventDefault()
  })

  // --- マウス ---

  function lineAt(target: EventTarget | null): number | null {
    const g = target instanceof Element ? target.closest<SVGGElement>('.map-node') : null
    const value = g?.getAttribute('data-line')
    return value == null ? null : Number(value)
  }

  svg.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false
      return
    }
    const line = lineAt(event.target)
    if (line === null) return
    if (event.target instanceof Element && event.target.classList.contains('map-badge')) {
      toggle(line)
    } else {
      select(line)
    }
    scroller.focus({ preventScroll: true })
  })
  svg.addEventListener('dblclick', (event) => {
    const line = lineAt(event.target)
    if (line === null) return
    event.preventDefault()
    startRename(line)
  })

  // 何も無いところをドラッグすると図を動かす
  let pan: { x: number; y: number; left: number; top: number } | null = null
  scroller.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || lineAt(event.target) !== null) return
    if (event.target === input) return
    pan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop }
    scroller.setPointerCapture(event.pointerId)
    scroller.classList.add('panning')
  })
  scroller.addEventListener('pointermove', (event) => {
    if (pan === null) return
    scroller.scrollLeft = pan.left - (event.clientX - pan.x)
    scroller.scrollTop = pan.top - (event.clientY - pan.y)
  })
  const endPan = () => {
    pan = null
    scroller.classList.remove('panning')
  }
  scroller.addEventListener('pointerup', endPan)
  scroller.addEventListener('pointercancel', endPan)

  /** 拡大・縮小。`focus`（画面の座標）があれば、その点の下の図が動かないようにスクロールを合わせる。 */
  function setZoom(next: number, focus?: { x: number; y: number }): void {
    const value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    if (value === zoom) return
    const box = scroller.getBoundingClientRect()
    const fx = focus === undefined ? scroller.clientWidth / 2 : focus.x - box.left
    const fy = focus === undefined ? scroller.clientHeight / 2 : focus.y - box.top
    const cx = (scroller.scrollLeft + fx) / zoom
    const cy = (scroller.scrollTop + fy) / zoom
    zoom = value
    render()
    scroller.scrollLeft = cx * zoom - fx
    scroller.scrollTop = cy * zoom - fy
  }
  scroller.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), { x: event.clientX, y: event.clientY })
    },
    { passive: false },
  )

  // --- ドラッグで付け替え ---
  //
  // ノードを掴んで別のノードの上で離すと、その最後の子へ移す（moveNode）。並びの入れ替えは Alt+↑↓。
  // 少し動いたらドラッグにする。ドラッグの間は描き直さず、掴んだノードの位置だけをずらす。

  interface Drag {
    line: number
    pointerId: number
    x: number
    y: number
    active: boolean
    target: number | null
    g: SVGGElement | null
  }
  let drag: Drag | null = null
  /** ドラッグの直後の click（離したときに飛んでくる）を選択に使わない。 */
  let dragged = false

  /** 掴めるノードか（中心は動かせない）。 */
  function movable(line: number): boolean {
    const node = findNode(outline, line)
    return node !== null && node !== outline.root
  }

  function canDrop(line: number, target: number): boolean {
    if (line === target) return false
    const node = findNode(outline, line)
    if (node === null || node === outline.root) return false
    const isInside = (n: OutlineNode): boolean =>
      n.line === target || n.children.some((child) => isInside(child))
    return !isInside(node)
  }

  function startDrag(state: Drag): void {
    state.active = true
    state.g = svg.querySelector<SVGGElement>(`.map-node[data-line="${state.line}"]`)
    state.g?.classList.add('dragging')
    scroller.classList.add('drag')
    if (state.line !== selected) {
      selected = state.line
      for (const g of svg.querySelectorAll('.map-node.sel')) g.classList.remove('sel')
      state.g?.classList.add('sel')
    }
    try {
      svg.setPointerCapture(state.pointerId)
    } catch {
      // 捕まえなくても動く
    }
  }

  function moveDrag(state: Drag, x: number, y: number): void {
    const placed = placedOf(state.line)
    if (state.g === null || placed === undefined) return
    const dx = (x - state.x) / zoom
    const dy = (y - state.y) / zoom
    state.g.setAttribute('transform', `translate(${placed.x + dx} ${placed.y + dy})`)
    // 掴んだノードは pointer-events: none（CSS）なので、ポインタの下の別のノードが拾える
    const under = lineAt(document.elementFromPoint(x, y))
    const target = under !== null && canDrop(state.line, under) ? under : null
    if (target === state.target) return
    svg.querySelector('.map-node.drop')?.classList.remove('drop')
    state.target = target
    if (target !== null)
      svg.querySelector(`.map-node[data-line="${target}"]`)?.classList.add('drop')
  }

  function endDrag(drop: boolean): void {
    const state = drag
    drag = null
    if (state === null) return
    scroller.classList.remove('drag')
    if (!state.active) return
    dragged = true
    // click が来ない終わり方（pointercancel）でも次の click を潰さないよう、少しで戻す
    setTimeout(() => {
      dragged = false
    }, 0)
    const target = state.target
    if (drop && target !== null) {
      const parent = findNode(outline, target)
      collapsed.delete(target)
      if (parent !== null && commit(moveNode(text, state.line, target, parent.children.length)))
        return
    }
    render()
  }

  svg.addEventListener('pointerdown', (event) => {
    const line = lineAt(event.target)
    if (line === null || event.button !== 0 || draft !== null) return
    if (event.target instanceof Element && event.target.classList.contains('map-badge')) return
    drag = {
      line,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
      g: null,
    }
  })
  svg.addEventListener('pointermove', (event) => {
    const state = drag
    if (state === null || event.pointerId !== state.pointerId) return
    if (!state.active) {
      const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y)
      if (distance > DRAG_SLOP && movable(state.line)) startDrag(state)
      if (!state.active) return
    }
    moveDrag(state, event.clientX, event.clientY)
  })
  svg.addEventListener('pointerup', (event) => {
    if (drag !== null && event.pointerId === drag.pointerId) endDrag(true)
  })
  svg.addEventListener('pointercancel', () => endDrag(false))

  /** 操作のボタン。名前を打っている途中なら、先にその名前を確定する（ボタンは押してもフォーカスを奪わないため）。 */
  const onPress = (target: HTMLButtonElement, action: () => void) =>
    target.addEventListener('click', () => {
      if (draft !== null) closeDraft(true)
      action()
      if (draft === null) scroller.focus({ preventScroll: true })
    })
  onPress(addChildButton, () => startAdd('child'))
  onPress(addSiblingButton, () => startAdd('sibling'))
  onPress(renameButton, () => startRename(selected))
  onPress(removeButton, () => commit(removeNode(text, selected)))
  onPress(toggleButton, () => toggle(selected))
  onPress(undoButton, () => restore(undo, redo))
  onPress(redoButton, () => restore(redo, undo))
  onPress(zoomOutButton, () => setZoom(zoom / 1.2))
  onPress(zoomInButton, () => setZoom(zoom * 1.2))

  // --- コピー・カット・ペースト ---
  //
  // 図にフォーカスがあるときだけ扱う（名前の入力欄の中は、今までどおり文字のコピー・貼り付け）。
  // キーはブラウザに任せ（keydown で止めない）、届いた copy / cut / paste の clipboardData で読み書きする
  // —— navigator.clipboard と違って許可のダイアログが出ない。

  const mapFocused = (): boolean => document.activeElement === scroller && draft === null

  /** 選んだノードの部分木をクリップボードへ。入れたら true。 */
  function copyTo(event: ClipboardEvent): boolean {
    if (!mapFocused() || event.clipboardData === null) return false
    const copied = copyText(text, selected)
    if (copied === null) return false
    event.clipboardData.setData('text/plain', copied)
    event.preventDefault()
    return true
  }
  const onCopy = (event: ClipboardEvent) => {
    copyTo(event)
  }
  const onCut = (event: ClipboardEvent) => {
    // 中心は消せないのでコピーだけになる（removeNode が null）
    if (copyTo(event)) commit(removeNode(text, selected))
  }
  const onPaste = (event: ClipboardEvent) => {
    if (!mapFocused() || event.clipboardData === null) return
    event.preventDefault()
    // 畳んでいるノードに貼ったら開く（貼ったものが見えるように）
    const before = collapsed.has(selected)
    collapsed.delete(selected)
    if (!commit(pasteNodes(text, selected, event.clipboardData.getData('text/plain'))) && before) {
      collapsed.add(selected)
    }
  }
  document.addEventListener('copy', onCopy)
  document.addEventListener('cut', onCut)
  document.addEventListener('paste', onPaste)
  cleanups.push(() => {
    document.removeEventListener('copy', onCopy)
    document.removeEventListener('cut', onCut)
    document.removeEventListener('paste', onPaste)
  })

  // 見え方（字の大きさ・フォント）が変わったら測り直す
  const resize = new ResizeObserver(() => {
    const before = font.size
    readFont()
    if (font.size !== before) render()
  })
  resize.observe(scroller)
  cleanups.push(() => resize.disconnect())

  readFont()
  selected = outline.root.line
  render()
  // 作ったばかり（本文が空）なら、すぐ中心の名前を打てるように
  if (text.trim() === '') startRename(outline.root.line)
  else scroller.focus({ preventScroll: true })

  return {
    destroy() {
      if (destroyed) return
      // 打ちかけの名前は確定して渡す（段階を移る前に保存に乗るように）
      if (draft !== null) closeDraft(true, false)
      destroyed = true
      for (const cleanup of cleanups) cleanup()
    },
  }
}
