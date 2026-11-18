import { type Lang, MESSAGES } from './i18n/index.js'
import { MIN_REASONS } from './outline-checks.js'
import { outlineRoles, type Role } from './outline-roles.js'

/**
 * アウトラインの画面でマップの上に出す、選んでいる項目に合わせた問い（AI なし。`docs/plans/archive/ideas-outline.md`）。純関数。
 *
 * アイデアの段階をなくしたので、マップの上で「この項目に何を書くか」と「次に何を足すか」を出して、空のマップから埋めていけるようにする。
 * 役割の決め方は下書きの横のリスト・型のチェックと同じ（`outline-roles.ts`）。全体で足りないものは型のチェック（`outline-checks.ts`）が受け持つ。
 */

export interface OutlinePrompt {
  /** 選んでいる項目の役割。空のマップ・仮の中心は null。 */
  role: Role | null
  /** この項目に書くこと。 */
  write: string
  /** 次にすること（無ければ null）。 */
  next: string | null
}

/**
 * @param text アウトラインの本文（入力中なら仮の枝を入れたもの）
 * @param line 選んでいる項目の行（仮の中心は -1）
 */
export function outlinePrompt(text: string, line: number, lang: Lang): OutlinePrompt {
  const m = MESSAGES[lang].outlinePrompts
  const WRITE = m.write
  const items = outlineRoles(text)
  if (items.length === 0) return { role: null, write: m.empty, next: null }
  const index = items.findIndex((item) => item.line === line)
  const item = items[index]
  if (item === undefined) {
    const topics = items.filter((i) => i.role === 'topic').length
    // 知らない行（意見が 1 つなら、その意見を選んでいるものとして）
    const first = items[0]
    if (topics <= 1 && first !== undefined) return outlinePrompt(text, first.line, lang)
    // 仮の中心（字下げ 0 の行が 2 つ以上）
    return {
      role: null,
      write: m.manyTopics(topics),
      next: m.mergeTopics,
    }
  }

  switch (item.role) {
    case 'topic': {
      // この意見の下の理由・結論（次の意見の手前まで）
      const after = items.slice(index + 1)
      const end = after.findIndex((i) => i.role === 'topic')
      const own = end === -1 ? after : after.slice(0, end)
      const reasons = own.filter((i) => i.role === 'reason').length
      const hasConclusion = own.some((i) => i.role === 'conclusion')
      let next: string
      if (reasons < MIN_REASONS) next = m.addReason
      else if (!hasConclusion) next = m.addConclusion
      else next = m.checkTopic
      return { role: 'topic', write: WRITE.topic, next }
    }
    case 'reason': {
      const hasExample = items[index + 1]?.role === 'example'
      return {
        role: 'reason',
        write: WRITE.reason,
        next: hasExample ? m.addSiblingReason : m.addExample,
      }
    }
    case 'example':
      return {
        role: 'example',
        write: WRITE.example,
        next: m.moreConcrete,
      }
    case 'conclusion':
      return {
        role: 'conclusion',
        write: WRITE.conclusion,
        next: m.toDraft,
      }
  }
}
