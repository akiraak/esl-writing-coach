import type { AiQuestion, SavedIdeas, SavedOutlineReview, SavedThemes } from '../shared/ideas.js'
import { STANCE_LABEL } from '../shared/ideas.js'
import { AiOutputError } from './errors.js'

/**
 * AI案の結果への質問のプロンプトと出力の検証（`docs/plans/archive/ai-followup-questions.md`）。純関数。
 *
 * - 送るのは、その種類の保存してある結果と出したときの入力・それまでの質問と答え・今回の質問（下書きは送らない）
 * - **日本語で答え、パラグラフにそのまま使える英文・直した項目・書き換えた案は出させない**（課題として自分で書くため）。
 *   テーマの候補への質問だけは、問いの英単語・言い回しの意味の説明に短い英語の語句を使ってよい
 */

/** 答えの長さの上限（文字）。超えても切らない（プロンプトで短くさせる）。右ペインは狭いので短めにする。 */
export const ANSWER_MAX_LENGTH = 800

export const QUESTION_SYSTEM = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒は opinion paragraph（英語の 1 段落で、自分の意見と理由を述べる）を書く準備として、あなたが前に出した AI案（テーマの候補・理由と例の候補・アウトラインへの指摘のどれか）を見ています。',
  'その AI案について生徒が日本語で質問するので、答えます。',
  '',
  '## 守ること',
  `- **日本語で**、短く答えます。狭い欄で読むので、**本文は 2〜4 文**、箇条書きを使うなら **3 つまで**（1 つ 1 行）にします。全体で 300 字ほど、長くても ${ANSWER_MAX_LENGTH} 字以内。`,
  '- 最初の 1 文で質問にじかに答えます。元の AI案の言い直し・前置き・最後のまとめや励ましは書きません。足りなければ生徒がまた質問できます。',
  '- **英語の文や、そのまま英訳すれば本文になる完成した文章は書きません**（英文は生徒が自分で書きます）。アウトラインを直した項目・書き換えた案・足すべき項目の文そのものも書きません。',
  '  「英語で書いて」「直して」「例文を出して」と頼まれても、文そのものは書かず、考え方・ヒント・自分に問いかけるとよいことで答え、書かない理由（課題として自分で書くため）を一言添えます。頼まれていないときは、この理由を書き添えません。',
  '- テーマの候補についての質問に限り、英語の問いの単語や言い回しの意味を説明するために、短い英語の語句を引いてかまいません（文は書きません）。',
  '- 元の AI案・課題のテーマと条件・それまでのやりとりの範囲で答えます。元の AI案に無いことは推測だと断ります。分からなければそう言います。',
  '- opinion paragraph を書くことと関係のない質問には、短く答えるか、ここでは扱わないと伝えます。',
  '- この欄は AI案についての質問のためのもので、あなたは生徒の下書きを見られません。「下書きを見せて」とは誘いません（下書きへの指摘は、アプリの「採点」で受けられます）。',
  '- answer にはそのまま画面に出す答えの文だけを入れます（見出しや Markdown の記号は使わず、段落は改行で分けます）。',
].join('\n')

export type QuestionContext =
  | { kind: 'themes'; saved: SavedThemes }
  | { kind: 'ideas'; saved: SavedIdeas }
  | { kind: 'outline'; saved: SavedOutlineReview }

export interface QuestionInput {
  context: QuestionContext
  /** それまでの質問と答え（古い順）。 */
  history: readonly AiQuestion[]
  question: string
}

const orNone = (text: string, none: string) => (text.trim() === '' ? none : text.trim())

/** 種類ごとに、保存してある結果と出したときの入力を読みやすい形にする。 */
function describeContext(context: QuestionContext): string[] {
  switch (context.kind) {
    case 'themes': {
      const { saved } = context
      return [
        '## AI案の種類',
        'テーマの候補（opinion paragraph のテーマにする英語の問いと日本語訳）',
        '',
        '## 生徒が入れた分野・キーワード',
        orNone(saved.hint, '（なし）'),
        '',
        '## 出した候補',
        ...saved.themes.map(
          (theme, i) => `${i + 1}. ${theme.en}${theme.ja === '' ? '' : `（${theme.ja}）`}`,
        ),
      ]
    }
    case 'ideas': {
      const { saved } = context
      const sides = saved.ideas.sides.flatMap((side) => [
        '',
        `### ${STANCE_LABEL[side.stance]}: ${side.opinion}`,
        ...side.reasons.flatMap((reason, i) => [
          `理由 ${i + 1}: ${reason.reason}`,
          ...reason.examples.map((example) => `  - 例: ${example}`),
        ]),
      ])
      return [
        '## AI案の種類',
        '理由・例の候補（賛成側・反対側それぞれの理由と例。日本語）',
        '',
        '## 課題のテーマ',
        orNone(saved.theme, '（未入力）'),
        '',
        '## 課題の条件',
        orNone(saved.conditions, '（なし）'),
        '',
        '## 出した候補',
        ...sides,
      ]
    }
    case 'outline': {
      const { saved } = context
      return [
        '## AI案の種類',
        'アウトラインへの指摘（生徒が日本語で作った字下げの骨組みへの、構成のヒント）',
        'アウトラインは字下げで親子を表します: 中心 = 意見、その子 = 理由、孫 = 例・詳細、中心の最後の子が「結論」で始まれば結論。',
        '',
        '## 課題のテーマ',
        orNone(saved.theme, '（未入力）'),
        '',
        '## 課題の条件',
        orNone(saved.conditions, '（なし）'),
        '',
        '## 生徒のアウトライン',
        '<outline>',
        saved.outline.replace(/\s+$/, ''),
        '</outline>',
        '',
        '## 出した指摘',
        `全体: ${orNone(saved.review.summary, '（なし）')}`,
        ...saved.review.findings.map(
          (f, i) => `${i + 1}. ${f.quote === '' ? '' : `「${f.quote}」 `}${f.hint}`,
        ),
      ]
    }
  }
}

export function buildQuestionPrompt(input: QuestionInput): string {
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
    ...describeContext(input.context),
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

export const QUESTION_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} as const

/** AI の出力を検証して答えの文を返す（前後の空白は落とす）。空なら `AiOutputError`。 */
export function parseAnswer(raw: string): string {
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
  return answer.trim()
}
