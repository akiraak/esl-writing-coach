import type {
  IdeaSuggestions,
  ReasonSuggestion,
  SideSuggestion,
  Stance,
  ThemeSuggestion,
} from '../shared/ideas.js'
import { AiOutputError } from './errors.js'

/**
 * AI のアイデア出しのプロンプトと、出力の検証（`docs/plans/archive/ai-ideas.md`）。純関数なので node でテストする。
 *
 * - テーマの候補は英語の問いと日本語訳。理由・例の候補は**日本語**（メモは日本語可。英文は生徒が自分で書くので英語の文は出さない）
 * - 出力は構造化出力（JSON スキーマ）で受け、ここで検証して数を収める
 */

export const THEME_COUNT = 5
const REASON_COUNT = 3
const EXAMPLE_COUNT = 2

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function parseJson(raw: string, what: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new AiOutputError(`${what}を JSON として読めません`)
  }
  if (!isRecord(value)) throw new AiOutputError(`${what}の形が違います`)
  return value
}

// --- テーマの候補 ---

export const THEMES_SYSTEM = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒が授業で書く opinion paragraph（英語の 1 段落で、自分の意見と理由を述べる）のテーマの候補を出します。',
  '',
  '## 守ること',
  `- 候補は ${THEME_COUNT} つ。どれも賛成・反対の立場を取れる英語の問い（Should …? / Is it better to …? / Do you agree that …? など）にします。`,
  '- 生徒が身近な経験から理由と例を挙げられるもの（学校・仕事・暮らし・技術・社会など）にし、専門知識が要るものは避けます。',
  '- 問いは中級の学習者が読める短く平易な英語で。ja には自然な日本語訳を入れます。',
  '- 分野やキーワードが渡されたら、それに沿った候補にします。渡されなければ分野をばらけさせます。',
].join('\n')

export function buildThemesPrompt(hint: string): string {
  const h = hint.trim()
  return h === ''
    ? `テーマの候補を ${THEME_COUNT} つ出してください（分野の指定なし）。`
    : `次の分野・キーワードに沿って、テーマの候補を ${THEME_COUNT} つ出してください。\n\n<hint>\n${h}\n</hint>`
}

export const THEMES_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { en: { type: 'string' }, ja: { type: 'string' } },
        required: ['en', 'ja'],
        additionalProperties: false,
      },
    },
  },
  required: ['themes'],
  additionalProperties: false,
} as const

export function parseThemes(raw: string): ThemeSuggestion[] {
  const value = parseJson(raw, 'テーマの候補')
  if (!Array.isArray(value['themes'])) throw new AiOutputError('テーマの候補がありません')
  const themes = value['themes']
    .flatMap((t): ThemeSuggestion[] =>
      isRecord(t) && text(t['en']) !== '' ? [{ en: text(t['en']), ja: text(t['ja']) }] : [],
    )
    .slice(0, THEME_COUNT)
  if (themes.length === 0) throw new AiOutputError('テーマの候補がありません')
  return themes
}

// --- 理由・例の候補 ---

export const IDEAS_SYSTEM = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒が opinion paragraph を書く前のアイデア出しを手伝います。テーマに対して、賛成側と反対側それぞれの理由と例の候補を出します。',
  '',
  '## 守ること',
  '- **すべて日本語で**書きます。英語の文や、そのまま英訳すれば本文になるような完成した文章は出しません（英文は生徒が自分で書きます）。',
  `- 賛成側（for）・反対側（against）それぞれ、意見を 1 文（opinion）と、理由を ${REASON_COUNT} つ（reason）。`,
  `- 各理由に、具体的な例・場面・数字・体験などを 1〜${EXAMPLE_COUNT} つ（examples）。それぞれ短いメモの形（1 行ずつ）で。`,
  '- 理由どうしが重ならないようにし、生徒が自分の経験に結び付けやすいものにします。',
  '- 理由の頭に First / Second / Finally や「1つ目」などの順番の言葉は付けません（順番は生徒が並べます）。',
  '- 課題の条件が渡されたら、それに合う候補にします（例: 理由の数の指定）。',
].join('\n')

export interface IdeasInput {
  theme: string
  conditions: string
}

export function buildIdeasPrompt(input: IdeasInput): string {
  const conditions = input.conditions.trim()
  return [
    '## テーマ',
    input.theme.trim(),
    '',
    '## 課題の条件',
    conditions === '' ? '（なし）' : conditions,
  ].join('\n')
}

const sideSchema = {
  type: 'object',
  properties: {
    opinion: { type: 'string' },
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          examples: { type: 'array', items: { type: 'string' } },
        },
        required: ['reason', 'examples'],
        additionalProperties: false,
      },
    },
  },
  required: ['opinion', 'reasons'],
  additionalProperties: false,
}

export const IDEAS_SCHEMA = {
  type: 'object',
  properties: { for: sideSchema, against: sideSchema },
  required: ['for', 'against'],
  additionalProperties: false,
} as const

/** 理由の頭の順番の言葉（First: / Second、/ 1つ目： など）を落とす。並べ方は生徒が決めるため。 */
export function stripOrdinal(reason: string): string {
  return reason
    .replace(/^(first|second|third|finally|lastly|next)\s*[:：,、.．]\s*/i, '')
    .replace(/^([0-9０-９]+|[一二三])\s*(つ目|番目)?\s*[:：.．、)）]\s*/, '')
    .trim()
}

function parseSide(value: unknown, stance: Stance): SideSuggestion {
  if (!isRecord(value)) throw new AiOutputError(`理由・例の候補に ${stance} がありません`)
  const reasons = Array.isArray(value['reasons'])
    ? value['reasons']
        .flatMap((r): ReasonSuggestion[] =>
          isRecord(r) && text(r['reason']) !== ''
            ? [
                {
                  reason: stripOrdinal(text(r['reason'])),
                  examples: (Array.isArray(r['examples']) ? r['examples'] : [])
                    .map(text)
                    .filter((e) => e !== '')
                    .slice(0, EXAMPLE_COUNT),
                },
              ]
            : [],
        )
        .slice(0, REASON_COUNT)
    : []
  if (reasons.length === 0) throw new AiOutputError(`理由・例の候補の ${stance} に理由がありません`)
  return { stance, opinion: text(value['opinion']), reasons }
}

export function parseIdeas(raw: string): IdeaSuggestions {
  const value = parseJson(raw, '理由・例の候補')
  return { sides: [parseSide(value['for'], 'for'), parseSide(value['against'], 'against')] }
}
