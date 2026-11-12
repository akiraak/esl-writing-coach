import { AiOutputError } from './errors.js'

/**
 * 下書きの日本語訳のプロンプトと、AI の出力の検証（`docs/plans/archive/draft-translation.md`）。純関数なので node でテストする。
 *
 * - 文に分けるのはアプリ。段落全体（文脈）と番号つきの文を渡し、番号ごとの訳を返させる
 * - **直訳に近い訳**（2026-11-11 ユーザーの決定）: 英語に書いてあるとおりを訳す。誤りを直してから訳さない
 *   （言いたいことが英語で伝わっているかを、訳を読んで確かめるため）
 * - 送るのは下書きとタイトル（STEP 3 のタイトルの欄。あれば 1 番目の文として訳す。`docs/plans/archive/draft-title.md`）
 */

export const TRANSLATION_SYSTEM = [
  'あなたは英語を日本語に訳す翻訳者です。',
  '英語を第二言語として学ぶ日本人の生徒が書いた英語の 1 段落を、文ごとに日本語に訳します。',
  '生徒は訳を読んで、自分の言いたいことが英語で伝わっているかを確かめます。',
  '',
  '## 守ること',
  '- **直訳に近い訳**にします。英語に書いてあるとおりの意味を、語順や言い回しをできるだけ保って訳します。意訳して自然な日本語に整えすぎません。',
  '- 英文に誤りがあっても、**正しい英文に直してから訳さないでください**。書いてある英語が読み手にどう伝わるかを、そのまま訳します（言葉が足りなければ足りないまま、意味がずれていればずれたまま）。綴りの誤りは、どの語か明らかなときだけその語として訳します。',
  '- 意味が取れない文や、どの語か分からない箇所は、推測で補わず「（意味が取れません）」「（〜が何を指すか分かりません）」のように訳の中に書きます。',
  '- 訳は「だ・である」の文体で、1 文につき 1 つ。説明・助言・直した英文は書きません。',
  '- 渡された番号の文を、1 つも飛ばさず、まとめたり分けたりせずに、番号ごとに訳します。段落全体は文脈を知るためのものです。',
  '- 英文に日本語が混じっていれば、その部分はそのまま残します。',
  '- kind="title" の付いた文は段落のタイトルです。文になっていなくても、タイトルとして短く訳します（体言止めでかまいません）。',
].join('\n')

export interface TranslationInput {
  /** STEP 3 のタイトル（1 行。空なら訳さない）。 */
  title: string
  draft: string
  /** アプリが分けた本文の文。 */
  sentences: readonly string[]
}

/** 訳す並び（タイトルがあれば先頭）。 */
function itemsOf(input: TranslationInput): { text: string; title: boolean }[] {
  return [
    ...(input.title === '' ? [] : [{ text: input.title, title: true }]),
    ...input.sentences.map((text) => ({ text, title: false })),
  ]
}

/** ユーザーのメッセージ（段落全体と、番号つきの文。タイトルがあれば 1 番）。 */
export function buildTranslationPrompt(input: TranslationInput): string {
  return [
    '## 段落全体',
    '<paragraph>',
    input.draft.trim(),
    '</paragraph>',
    '',
    '## 訳す文',
    ...itemsOf(input).map(
      (item, i) => `<s n="${i + 1}"${item.title ? ' kind="title"' : ''}>${item.text}</s>`,
    ),
  ].join('\n')
}

/** AI の出力を、タイトルの訳（無ければ空）と文の並びに合わせた訳にする。 */
export function parseTranslationOutput(
  text: string,
  input: TranslationInput,
): { title: string; sentences: string[] } {
  const all = parseTranslations(text, itemsOf(input).length)
  return input.title === ''
    ? { title: '', sentences: all }
    : { title: all[0] ?? '', sentences: all.slice(1) }
}

export const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, ja: { type: 'string' } },
        required: ['n', 'ja'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * AI の出力（JSON の文字列）を、文の並びに合わせた訳の配列にする（番号で対応させる。返ってこなかった文は空）。
 * 1 つも訳が無ければ `AiOutputError`。
 */
export function parseTranslations(text: string, count: number): string[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AiOutputError('訳の結果を JSON として読めません')
  }
  if (!isRecord(value) || !Array.isArray(value['translations'])) {
    throw new AiOutputError('訳の結果に translations がありません')
  }
  const out = Array.from({ length: count }, () => '')
  for (const item of value['translations']) {
    if (!isRecord(item) || typeof item['n'] !== 'number' || typeof item['ja'] !== 'string') continue
    const index = item['n'] - 1
    if (Number.isInteger(index) && index >= 0 && index < count && out[index] === '') {
      out[index] = item['ja'].trim()
    }
  }
  if (out.every((ja) => ja === '')) throw new AiOutputError('訳が返ってきませんでした')
  return out
}
