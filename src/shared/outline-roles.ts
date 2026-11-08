import { type OutlineNode, parseOutline } from './outline.js'

/**
 * アウトラインの各ノードに構成の役割を付けて、上から並べる（下書きの横のリスト。`docs/plans/archive/draft-editor.md`）。純関数。
 *
 * - 中心 = Topic sentence、子 = Reason、孫より深いもの = Example
 * - **結論**: 中心の子のうち最後のものの名前が「結論」「まとめ」「Conclusion」で始まっていれば結論（その子孫も結論）
 * - 字下げ 0 の行が 2 つ以上なら、それぞれを Topic sentence として並べる（仮の中心は出さない）。
 *   字下げ 0 の最後の行にも結論の規則を当てる
 */

export type Role = 'topic' | 'reason' | 'example' | 'conclusion'

export interface RoleItem {
  role: Role
  label: string
  /** リストでの字下げ（Topic・結論の頭 = 0、理由 = 1、例 = 2 以上）。 */
  level: number
  /** 理由の番号（1 から）。理由でなければ null。 */
  number: number | null
  /** 本文の行（0 始まり）。 */
  line: number
}

const CONCLUSION = /^\s*(結論|まとめ|conclusion)/i

const isConclusion = (node: OutlineNode | undefined) =>
  node !== undefined && CONCLUSION.test(node.label)

export function outlineRoles(text: string): RoleItem[] {
  const { root } = parseOutline(text, '')
  const items: RoleItem[] = []
  let reasons = 0

  const push = (node: OutlineNode, role: Role, level: number) => {
    items.push({
      role,
      label: node.label,
      level,
      number: role === 'reason' ? ++reasons : null,
      line: node.line,
    })
  }
  /** 結論の部分木（頭を level 0、子孫は 1 段ずつ）。 */
  const conclusion = (node: OutlineNode, level: number) => {
    push(node, 'conclusion', level)
    for (const child of node.children) conclusion(child, level + 1)
  }
  const example = (node: OutlineNode, level: number) => {
    push(node, 'example', level)
    for (const child of node.children) example(child, level + 1)
  }
  const topic = (node: OutlineNode) => {
    push(node, 'topic', 0)
    const last = node.children.at(-1)
    for (const child of node.children) {
      if (child === last && isConclusion(child)) {
        conclusion(child, 0)
        continue
      }
      push(child, 'reason', 1)
      for (const grand of child.children) example(grand, 2)
    }
  }

  if (root.line !== -1) {
    topic(root)
  } else {
    const last = root.children.at(-1)
    for (const node of root.children) {
      if (node === last && root.children.length > 1 && isConclusion(node)) conclusion(node, 0)
      else topic(node)
    }
  }
  return items
}

/** 理由の数（タイルの「理由 3」）。 */
export function countReasons(text: string): number {
  return outlineRoles(text).filter((item) => item.role === 'reason').length
}
