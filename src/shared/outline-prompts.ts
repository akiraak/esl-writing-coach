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

const WRITE: Readonly<Record<Role, string>> = {
  topic: 'テーマへの答え（賛成か反対か）を 1 文で',
  reason: '意見を支える理由（なぜそう思う？）を短く',
  example: '理由を支える具体例（体験・数字・場面）',
  conclusion: '意見を別の言い方で言い直す（新しい理由は足さない）',
}

/**
 * @param text アウトラインの本文（入力中なら仮の枝を入れたもの）
 * @param line 選んでいる項目の行（仮の中心は -1）
 */
export function outlinePrompt(text: string, line: number): OutlinePrompt {
  const items = outlineRoles(text)
  if (items.length === 0) {
    return {
      role: null,
      write: 'まず中心に、テーマへの答え（賛成か反対か）を 1 文で書く',
      next: null,
    }
  }
  const index = items.findIndex((item) => item.line === line)
  const item = items[index]
  if (item === undefined) {
    const topics = items.filter((i) => i.role === 'topic').length
    // 知らない行（意見が 1 つなら、その意見を選んでいるものとして）
    const first = items[0]
    if (topics <= 1 && first !== undefined) return outlinePrompt(text, first.line)
    // 仮の中心（字下げ 0 の行が 2 つ以上）
    return {
      role: null,
      write: `意見（字下げ 0 の項目）が ${topics} つあります`,
      next: '意見は 1 つにまとめ、ほかは理由や例としてその下に入れる',
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
      if (reasons < MIN_REASONS) next = 'なぜそう思う？ 理由を子に足す（Tab）'
      else if (!hasConclusion) next = '理由がそろったら、最後の子に「結論: …」を足す'
      else next = '意見はテーマの問いにはっきり答えている？'
      return { role: 'topic', write: WRITE.topic, next }
    }
    case 'reason': {
      const hasExample = items[index + 1]?.role === 'example'
      return {
        role: 'reason',
        write: WRITE.reason,
        next: hasExample
          ? 'ほかの理由は兄弟に足す（Enter）'
          : 'たとえば？ 体験・数字・場面を子に足す（Tab）',
      }
    }
    case 'example':
      return {
        role: 'example',
        write: WRITE.example,
        next: 'もっと具体的に言える？（いつ・どこで・誰が・いくら）',
      }
    case 'conclusion':
      return {
        role: 'conclusion',
        write: WRITE.conclusion,
        next: '仕上がったら「STEP 3 下書き・推敲へ」',
      }
  }
}
