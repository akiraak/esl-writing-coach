import type { OutlineReview } from '../shared/ideas.js'
import { AiOutputError } from './errors.js'

/**
 * アウトラインへの AI の指摘のプロンプトと出力の検証（`docs/plans/archive/outline-ai-feedback.md`）。純関数。
 *
 * - 日本語のヒントだけを出し、**直した項目・書き換えた案は出させない**（骨組みは生徒が自分で作るため）
 * - 指摘の引用はアウトラインからそのまま。アウトラインに無い引用は消す（採点の `dropUnquotable` と同じ考え方）
 */

export const MAX_OUTLINE_FINDINGS = 6

export const OUTLINE_SYSTEM = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒が opinion paragraph を英語で書く前に、日本語で作ったアウトライン（字下げの骨組み）を見て、構成の問題を指摘します。',
  'アウトラインは字下げで親子を表します: 中心 = 意見（topic sentence の元）、その子 = 理由、孫 = 例・詳細、中心の最後の子が「結論」で始まれば結論。',
  '',
  '## 見ること',
  '- 意見がテーマの問いにはっきり答えているか（賛成か反対かが分かるか）',
  '- 理由が意見を支えているか、理由どうしが重なっていないか',
  '- 例・詳細が具体的で、その理由を支えているか',
  '- 結論が意見を言い換えて締めているか（新しい理由を出していないか）',
  '- 課題の条件（理由の数など）に合っているか',
  '',
  '## 守ること',
  '- **すべて日本語で**。**直した項目・書き換えた案・足すべき項目の文そのものは書きません**（生徒が自分で考えます）。何が問題か・何を考えればよいかを短いヒントで伝えます。',
  '- 指摘の quote には、問題のある項目をアウトラインから**1 文字も変えずに**抜き出します。全体についての指摘なら空文字にします。',
  `- 指摘は大事なものから、多くても ${MAX_OUTLINE_FINDINGS} つ。よくできていれば少なくてかまいません。`,
  '- summary は全体の一言（よい点を 1 つと、いちばん大事な直しどころ）を日本語 1〜2 文で。',
].join('\n')

export interface OutlineReviewInput {
  theme: string
  conditions: string
  outline: string
}

export function buildOutlineReviewPrompt(input: OutlineReviewInput): string {
  const theme = input.theme.trim()
  const conditions = input.conditions.trim()
  return [
    '## テーマ',
    theme === '' ? '（未入力）' : theme,
    '',
    '## 課題の条件',
    conditions === '' ? '（なし）' : conditions,
    '',
    '## アウトライン',
    '<outline>',
    input.outline.replace(/\s+$/, ''),
    '</outline>',
  ].join('\n')
}

export const OUTLINE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, hint: { type: 'string' } },
        required: ['quote', 'hint'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'findings'],
  additionalProperties: false,
} as const

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/** AI の出力を検証する。アウトラインに無い引用は消し、空のヒントは捨て、6 つまでにする。 */
export function parseOutlineReview(raw: string, outline: string): OutlineReview {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new AiOutputError('アウトラインの指摘を JSON として読めません')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AiOutputError('アウトラインの指摘の形が違います')
  }
  const record = value as Record<string, unknown>
  const text = squash(outline)
  const findings = (Array.isArray(record['findings']) ? record['findings'] : [])
    .flatMap((f): OutlineReview['findings'] => {
      if (typeof f !== 'object' || f === null) return []
      const item = f as Record<string, unknown>
      const hint = typeof item['hint'] === 'string' ? item['hint'].trim() : ''
      if (hint === '') return []
      const quote = typeof item['quote'] === 'string' ? item['quote'].trim() : ''
      return [{ quote: quote !== '' && text.includes(squash(quote)) ? quote : '', hint }]
    })
    .slice(0, MAX_OUTLINE_FINDINGS)
  const summary = typeof record['summary'] === 'string' ? record['summary'].trim() : ''
  return { summary, findings }
}
