import type { OutlineNode } from './outline.js'

/**
 * マインドマップの並べ方（daily-note の `docs/plans/archive/mindmap.md`。daily-note の `src/editor/` から移植）。DOM を使わないので node でテストする。
 *
 * 中心を左に置き、右へ広げる横向きの木。子は親の右に縦に積み、親は子の並びの縦の中央に置く。
 * 部分木ごとに縦の帯を分けるので、兄弟の部分木は重ならない（詰め込みはしない単純な形）。
 * ノードの大きさは呼び出し側が測って渡す（ブラウザは文字を測る。テストは固定の値）。
 * 座標は保存しない —— 開くたびにテキストから並べ直す。
 */

export interface Size {
  width: number
  height: number
}

export interface LayoutOptions {
  /** 親の右端と子の左端の間。 */
  gapX: number
  /** 兄弟の部分木の間。 */
  gapY: number
}

export const DEFAULT_LAYOUT: LayoutOptions = { gapX: 40, gapY: 8 }

export interface PlacedNode {
  /** ノードの行（仮の中心は -1）。 */
  line: number
  depth: number
  /** 左上。 */
  x: number
  y: number
  width: number
  height: number
  /** 畳んでいて子を並べていないとき、隠れている子孫の数。畳んでいなければ 0。 */
  hidden: number
}

/** 親の右の中ほど → 子の左の中ほど。 */
export interface PlacedEdge {
  /** 子の行。 */
  line: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface MindmapLayout {
  /** 前順（親が先、兄弟は上から）。 */
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  /** 全体の大きさ（座標は 0 から）。 */
  width: number
  height: number
}

/**
 * @param sizeOf ノードの大きさ
 * @param collapsed 畳んでいるノードの行（子を並べない）
 */
export function layoutMindmap(
  root: OutlineNode,
  sizeOf: (node: OutlineNode) => Size,
  collapsed: ReadonlySet<number> = new Set(),
  options: LayoutOptions = DEFAULT_LAYOUT,
): MindmapLayout {
  const sizes = new Map<OutlineNode, Size>()
  const blocks = new Map<OutlineNode, number>()
  const shown = (node: OutlineNode) => (collapsed.has(node.line) ? [] : node.children)

  // 1. 部分木の縦の帯の高さ（下から）
  const measure = (node: OutlineNode): number => {
    const size = sizeOf(node)
    sizes.set(node, size)
    const children = shown(node)
    const stacked =
      children.reduce((sum, child) => sum + measure(child), 0) +
      options.gapY * Math.max(0, children.length - 1)
    const block = Math.max(size.height, stacked)
    blocks.set(node, block)
    return block
  }
  measure(root)

  // 2. 上から置く。帯の中で、子の並びを縦の中央に、親を子の並びの中央に
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []
  let width = 0
  const place = (node: OutlineNode, x: number, top: number): PlacedNode => {
    const size = sizes.get(node) ?? { width: 0, height: 0 }
    const block = blocks.get(node) ?? size.height
    const children = shown(node)
    const placed: PlacedNode = {
      line: node.line,
      depth: node.depth,
      x,
      y: 0,
      width: size.width,
      height: size.height,
      hidden: children === node.children ? 0 : countDescendants(node),
    }
    nodes.push(placed)
    width = Math.max(width, x + size.width)
    if (children.length === 0) {
      placed.y = top + (block - size.height) / 2
      return placed
    }
    const stacked =
      children.reduce((sum, child) => sum + (blocks.get(child) ?? 0), 0) +
      options.gapY * (children.length - 1)
    let y = top + (block - stacked) / 2
    const childX = x + size.width + options.gapX
    const placedChildren = children.map((child) => {
      const at = place(child, childX, y)
      y += (blocks.get(child) ?? 0) + options.gapY
      return at
    })
    // 親は最初と最後の子の中ほどに。ただし自分の帯からははみ出さない（はみ出すと上下の兄弟の部分木に重なる）
    const first = placedChildren[0]
    const last = placedChildren.at(-1)
    const middle =
      first === undefined || last === undefined
        ? top + block / 2
        : (first.y + first.height / 2 + last.y + last.height / 2) / 2
    placed.y = Math.min(Math.max(middle - size.height / 2, top), top + block - size.height)
    for (const child of placedChildren) {
      edges.push({
        line: child.line,
        fromX: x + size.width,
        fromY: placed.y + size.height / 2,
        toX: child.x,
        toY: child.y + child.height / 2,
      })
    }
    return placed
  }
  place(root, 0, 0)
  return { nodes, edges, width, height: blocks.get(root) ?? 0 }
}

function countDescendants(node: OutlineNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

/**
 * 長い名前を折り返す。全角は 2 桁、半角は 1 桁で数え、`columns` 桁を超える手前で切る。
 * 半角の語の途中では、行内に空白があればそこで切る（無ければ語の途中で切る）。
 */
export function wrapLabel(label: string, columns = 40): string[] {
  const rows: string[] = []
  let row = ''
  let width = 0
  for (const ch of label) {
    const w = charWidth(ch)
    if (width + w > columns && row !== '') {
      const space = row.lastIndexOf(' ')
      if (/[!-~]/.test(ch) && space > 0 && /^[!-~]+$/.test(row.slice(space + 1))) {
        rows.push(row.slice(0, space))
        row = row.slice(space + 1)
      } else {
        rows.push(row.trimEnd())
        row = ''
      }
      width = Array.from(row).reduce((sum, c) => sum + charWidth(c), 0)
      if (row === '' && ch === ' ') continue
    }
    row += ch
    width += w
  }
  if (row !== '' || rows.length === 0) rows.push(row)
  return rows
}

function charWidth(ch: string): number {
  // Latin-1 までと半角カナは 1 桁
  const code = ch.codePointAt(0) ?? 0
  return code <= 0xff || (code >= 0xff61 && code <= 0xff9f) ? 1 : 2
}
