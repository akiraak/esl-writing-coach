import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layoutMindmap, type PlacedNode, wrapLabel } from '../src/shared/mindmap-layout.js'
import { type OutlineNode, parseOutline } from '../src/shared/outline.js'

/**
 * マインドマップの並べ方（daily-note から移植したテスト）。**データは手で書いた架空のもの**（実データは使わない）。
 */

const GAPS = { gapX: 10, gapY: 4 }

/** 幅は名前の文字数 × 10、高さは 20（`高` で始まる名前だけ 60）。 */
function sizeOf(node: OutlineNode) {
  return {
    width: Array.from(node.label).length * 10,
    height: node.label.startsWith('高') ? 60 : 20,
  }
}

function layout(text: string, collapsed: number[] = []) {
  return layoutMindmap(parseOutline(text, '件名').root, sizeOf, new Set(collapsed), GAPS)
}

function at(nodes: PlacedNode[], line: number): PlacedNode {
  const node = nodes.find((n) => n.line === line)
  assert.ok(node, `行 ${line} のノードが無い`)
  return node
}

function overlaps(a: PlacedNode, b: PlacedNode): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** 部分木（自分と並んでいる子孫）の外接矩形。 */
function boxOf(nodes: PlacedNode[], root: OutlineNode, collapsed: Set<number>) {
  const lines: number[] = []
  const visit = (node: OutlineNode) => {
    lines.push(node.line)
    if (!collapsed.has(node.line)) for (const child of node.children) visit(child)
  }
  visit(root)
  const placed = lines.map((line) => at(nodes, line))
  return {
    top: Math.min(...placed.map((n) => n.y)),
    bottom: Math.max(...placed.map((n) => n.y + n.height)),
  }
}

const TEXT = [
  '中心',
  '\tあ',
  '\t\tあ1',
  '\t\tあ2',
  '\t\tあ3',
  '\tいい',
  '\tう',
  '\t\tう1',
  '\t\t\tう11',
  '\t\t\tう12',
].join('\n')

describe('layoutMindmap', () => {
  it('中心は左端、子は親の右端＋間隔', () => {
    const { nodes } = layout(TEXT)
    assert.equal(at(nodes, 0).x, 0)
    assert.equal(at(nodes, 1).x, 20 + 10)
    assert.equal(at(nodes, 5).x, 20 + 10)
    assert.equal(at(nodes, 2).x, 30 + 10 + 10)
    assert.equal(at(nodes, 8).x, at(nodes, 7).x + 20 + 10)
  })

  it('ノードは前順に並ぶ', () => {
    assert.deepEqual(
      layout(TEXT).nodes.map((n) => n.line),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    )
  })

  it('兄弟は上から順、部分木の帯は重ならない', () => {
    const { nodes } = layout(TEXT)
    const root = parseOutline(TEXT, '').root
    const boxes = root.children.map((child) => boxOf(nodes, child, new Set()))
    for (let i = 1; i < boxes.length; i++) {
      const before = boxes[i - 1]
      const box = boxes[i]
      assert.ok(
        before && box && before.bottom + 4 <= box.top + 1e-9,
        `部分木 ${i - 1} と ${i} が重なる`,
      )
    }
  })

  it('どのノードも重ならない', () => {
    const { nodes } = layout(
      ['高い中心', '\t高い子', '\t\ta', '\t\tb', '\tc', '\t\t高い孫', '\t\td', '\te'].join('\n'),
    )
    for (const a of nodes)
      for (const b of nodes)
        if (a !== b) assert.ok(!overlaps(a, b), `${a.line} と ${b.line} が重なる`)
  })

  it('親は最初と最後の子の中ほど', () => {
    const { nodes } = layout(TEXT)
    const parent = at(nodes, 1)
    const first = at(nodes, 2)
    const last = at(nodes, 4)
    const middle = (first.y + first.height / 2 + last.y + last.height / 2) / 2
    assert.equal(parent.y + parent.height / 2, middle)
  })

  it('子が 1 つで親の方が高ければ、子が親の中ほどに来る', () => {
    const { nodes } = layout(['中心', '\t高い', '\t\tx'].join('\n'))
    const parent = at(nodes, 1)
    const child = at(nodes, 2)
    assert.equal(child.y + child.height / 2, parent.y + parent.height / 2)
    assert.ok(parent.y >= 0)
  })

  it('全体の大きさと、座標が 0 から始まること', () => {
    const result = layout(TEXT)
    assert.equal(Math.min(...result.nodes.map((n) => n.y)), 0)
    assert.equal(result.height, Math.max(...result.nodes.map((n) => n.y + n.height)))
    assert.equal(result.width, Math.max(...result.nodes.map((n) => n.x + n.width)))
  })

  it('枝は親の右の中ほどから子の左の中ほどへ', () => {
    const { nodes, edges } = layout(TEXT)
    assert.equal(edges.length, nodes.length - 1)
    const edge = edges.find((e) => e.line === 3)
    const parent = at(nodes, 1)
    const child = at(nodes, 3)
    assert.deepEqual(edge, {
      line: 3,
      fromX: parent.x + parent.width,
      fromY: parent.y + parent.height / 2,
      toX: child.x,
      toY: child.y + child.height / 2,
    })
  })

  it('畳んだノードの子は並べず、隠れた子孫の数を持つ', () => {
    const { nodes, edges } = layout(TEXT, [6])
    assert.deepEqual(
      nodes.map((n) => n.line),
      [0, 1, 2, 3, 4, 5, 6],
    )
    assert.equal(at(nodes, 6).hidden, 3)
    assert.equal(at(nodes, 1).hidden, 0)
    assert.ok(edges.every((e) => e.line <= 6))
  })

  it('中心を畳むと中心だけ', () => {
    const { nodes, edges, height } = layout(TEXT, [0])
    assert.equal(nodes.length, 1)
    assert.equal(edges.length, 0)
    assert.equal(height, 20)
  })

  it('字下げ 0 の行が複数なら仮の中心（行 -1）から枝を出す', () => {
    const { nodes } = layout(['TODO:', '  a', 'Mon:'].join('\n'))
    assert.deepEqual(
      nodes.map((n) => n.line),
      [-1, 0, 1, 2],
    )
    assert.equal(at(nodes, -1).x, 0)
  })
})

describe('wrapLabel（長い名前の折り返し）', () => {
  it('短ければそのまま', () => {
    assert.deepEqual(wrapLabel('旅行の計画', 40), ['旅行の計画'])
    assert.deepEqual(wrapLabel('', 40), [''])
  })

  it('全角は 2 桁で数える', () => {
    assert.deepEqual(wrapLabel('あいうえおかきくけこ', 8), ['あいうえ', 'おかきく', 'けこ'])
  })

  it('半角の語の途中では空白で切る', () => {
    assert.deepEqual(wrapLabel('read the manual again', 10), ['read the', 'manual', 'again'])
  })

  it('空白の無い長い語は途中で切る', () => {
    assert.deepEqual(wrapLabel('abcdefghijkl', 5), ['abcde', 'fghij', 'kl'])
  })

  it('日本語と英語が混ざっていても桁を超えない', () => {
    for (const row of wrapLabel('Dropbox の API で list_folder を辿りきる', 12)) {
      const width = Array.from(row).reduce(
        (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) <= 0xff ? 1 : 2),
        0,
      )
      assert.ok(width <= 12, `「${row}」が 12 桁を超える`)
    }
  })
})
