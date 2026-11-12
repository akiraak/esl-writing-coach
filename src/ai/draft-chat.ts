import type { Assignment } from '../shared/assignment.js'
import { countSentences, countWords } from '../shared/counting.js'
import type { AiQuestion } from '../shared/ideas.js'
import { describeRange } from '../shared/stage-summary.js'
import { AiOutputError } from './errors.js'

/**
 * STEP 3 の「AI に質問」のプロンプトと出力の検証（`docs/plans/archive/draft-chat.md`）。純関数。
 *
 * - 送るのは、保存されている下書き・課題（テーマ・条件・語数と文数の指定）・アプリが数えた語数と文数・
 *   それまでの質問と答え・今回の質問（アウトライン・AI案の結果は送らない）。下書きが空でも聞ける
 * - 日本語で短く説明する。**英語は制限しない**（2026-11-11 ユーザーの決定）: 直した文・書き換えた文・例文も、
 *   質問に答えるのに要れば出してよい。アプリのほかの AI（AI案・AI案への質問）の「直した文は出さない」は
 *   変えず、**この「AI に質問」だけの例外**
 * - ただし頼まれていないのに下書き全体を書き直したり、パラグラフを丸ごと書いたりはしない
 */

/** 答えの長さの目安（文字）。プロンプトで短くさせる。 */
export const DRAFT_ANSWER_TARGET_LENGTH = 800
/** これを超える答えは、何かがおかしい（頼まれていない書き直しを並べたなど）ので受け取らない。 */
export const DRAFT_ANSWER_MAX_LENGTH = 4000

export const DRAFT_CHAT_SYSTEM = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒は授業の課題で opinion paragraph（英語の 1 段落で、自分の意見と理由を述べる）の下書きを書いている途中です。',
  '生徒が日本語で自由に質問するので、答えます（語・文法・表現の違い、自分の下書きについて、opinion paragraph の書き方など）。',
  '生徒の下書き・課題・アプリが数えた語数と文数を渡します。',
  '',
  '## 守ること',
  `- 説明は**日本語で**、短く書きます。狭い欄で読むので、**本文は 2〜4 文**、箇条書きを使うなら **3 つまで**（1 つ 1 行）にします。全体で 300 字ほど、長くても ${DRAFT_ANSWER_TARGET_LENGTH} 字以内。`,
  '- 最初の 1 文で質問にじかに答えます。質問の言い直し・前置き・最後のまとめや励ましは書きません。足りなければ生徒がまた質問できます。',
  '- **英語は必要なだけ使ってかまいません**。質問に答えるのに要るなら、英語の語句・例文・生徒の文を直した形・書き換えた文を出します（「この文を直して」「別の言い方は？」「例文を見せて」には英文で答え、どこをなぜ変えたかを日本語で一言添えます）。',
  '- ただし**聞かれたことにだけ**答えます。頼まれていないのに、下書き全体を書き直したり、パラグラフを丸ごと書いたり、聞かれていない箇所の誤りを並べたりはしません。',
  '  「全部直して」「パラグラフを書いて」と頼まれたときは、答えは短くという約束を越えてかまいませんが、いちばん大事な直しに絞り、残りは続けて聞けると伝えます。',
  '- 下書きの文を指すときは、その箇所を短く（10 語ほどまで）引用します。下書きが空（まだ書いていない）なら、下書きを見たふりをせず、一般的な説明か書き始めるための助言で答えます。',
  '- 語数・文数は、渡された「アプリが数えた値」を使います（自分で数え直しません）。',
  '- 英語として誤りではなく好みの差にすぎないときは、そう言います。分からないこと・文脈が足りないことは、そう言います。',
  '- opinion paragraph を書くことや英語と関係のない質問には、短く答えるか、ここでは扱わないと伝えます。',
  '- 点数は付けません（採点は、アプリの「採点」で受けられます）。',
  '- answer にはそのまま画面に出す答えの文だけを入れます（見出しや Markdown の記号は使わず、段落は改行で分けます。箇条書きは行頭に「・」）。',
].join('\n')

export interface DraftChatInput {
  assignment: Assignment
  /** 保存されている下書き（空でもよい）。 */
  draft: string
  /** それまでの質問と答え（古い順）。 */
  history: readonly AiQuestion[]
  question: string
}

/** ユーザーのメッセージ（課題・アプリが数えた値・下書き・それまでのやりとり・今回の質問）。 */
export function buildDraftChatPrompt(input: DraftChatInput): string {
  const { assignment } = input
  const draft = input.draft.trim()
  const words = describeRange(assignment.words, '語') ?? '指定なし'
  const sentences = describeRange(assignment.sentences, '文') ?? '指定なし'
  const history = input.history.flatMap((h, i) => [
    '',
    `### ${i + 1} 回目`,
    '<question>',
    h.question.trim(),
    '</question>',
    '<answer>',
    h.answer.trim(),
    '</answer>',
  ])
  return [
    '## 課題',
    `- テーマ: ${assignment.theme.trim() === '' ? '（未入力）' : assignment.theme.trim()}`,
    `- 語数の指定: ${words}`,
    `- 文数の指定: ${sentences}`,
    `- 構成や表現の条件: ${assignment.conditions.trim() === '' ? '（なし）' : `\n${assignment.conditions.trim()}`}`,
    '',
    '## アプリが数えた値',
    `- 語数: ${countWords(draft)}`,
    `- 文数: ${countSentences(draft)}`,
    '',
    '## 生徒の下書き（今の時点）',
    ...(draft === '' ? ['（まだ書いていません）'] : ['<paragraph>', draft, '</paragraph>']),
    '',
    '## それまでのやりとり',
    ...(history.length === 0 ? ['（なし）'] : history),
    '',
    '## 今回の質問',
    '<question>',
    input.question.trim(),
    '</question>',
  ].join('\n')
}

export const DRAFT_CHAT_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} as const

/** AI の出力を検証して答えの文を返す（前後の空白は落とす）。空・長すぎ・形が違えば `AiOutputError`。 */
export function parseDraftAnswer(raw: string): string {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new AiOutputError('質問への答えを JSON として読めません')
  }
  const answer =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)['answer']
      : undefined
  if (typeof answer !== 'string' || answer.trim() === '') {
    throw new AiOutputError('質問への答えが空です')
  }
  if (answer.trim().length > DRAFT_ANSWER_MAX_LENGTH) {
    throw new AiOutputError('質問への答えが長すぎます。質問を絞ってもう一度お試しください')
  }
  return answer.trim()
}
