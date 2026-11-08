import type { Role, RoleItem } from '../shared/outline-roles.js'
import { h } from './dom.js'

/**
 * アウトラインを構成の役割の色で並べたリスト（見るだけ）。下書きの横と、学習ガイドのモデル文のアウトラインの見本で使う。
 * 役割は `src/shared/outline-roles.ts`。色はアプリ全体で同じ（Topic = 青 / Reason = 緑 / Example = 橙 / Conclusion = 紫）。
 */

/** 役割 → 色の接尾辞（CSS の `n-ts` / `hl-ts` / `p-ts` など）。 */
export const ROLE_KEY: Readonly<Record<Role, string>> = {
  topic: 'ts',
  reason: 'rs',
  example: 'ex',
  conclusion: 'cs',
}

export function roleLabel(item: RoleItem): string {
  switch (item.role) {
    case 'topic':
      return 'OPINION'
    case 'reason':
      return `REASON ${item.number ?? ''}`.trim()
    case 'example':
      return 'EXAMPLE'
    case 'conclusion':
      return 'CONCLUSION'
  }
}

export function roleNodes(items: readonly RoleItem[]): HTMLElement[] {
  return items.map((item) => {
    const node = h(
      'div',
      { class: `node n-${ROLE_KEY[item.role]}` },
      h('small', {}, roleLabel(item)),
      item.label,
    )
    node.style.marginLeft = `${item.level * 0.7}rem`
    return node
  })
}
