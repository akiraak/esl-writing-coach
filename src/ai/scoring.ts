import type { Assignment } from '../shared/assignment.js'
import { countSentences, countWords } from '../shared/counting.js'
import { titleLine } from '../shared/export.js'
import {
  CRITERIA,
  CRITERION_KEYS,
  type CriterionKey,
  type CriterionScore,
  clampScore,
  type Finding,
  isCriterionKey,
  type Spelling,
} from '../shared/feedback.js'
import { describeRange } from '../shared/stage-summary.js'
import { AiOutputError } from './errors.js'

/**
 * 採点のプロンプトと、AI の出力の検証（`docs/plans/archive/ai-scoring.md`）。純関数なので node でテストする。
 *
 * - 基準は固定（配点は `src/shared/feedback.ts` の `CRITERIA`）。観点ごとに見ることはシステムプロンプトに書く
 * - 指摘にはヒント（どこを・何を確かめるか）と、**修正例の英文**（`fix`）を付ける（2026-11-11 から。
 *   それまでは直した文を出させなかった。`docs/plans/archive/scoring-fix-sentences.md`）。下書き全体の書き直しは出させない
 * - 綴りの誤り（誤字）は指摘に 1 つずつ挙げさせず、`spellings` に全部まとめさせる（正しい綴りつき。
 *   `docs/plans/archive/scoring-spellings.md`）
 * - 語数・文数はアプリが数えた値を渡す（AI に数えさせない）
 * - 出力は構造化出力（JSON スキーマ）で受け、ここで検証して点数を 0〜満点に収める
 */

/** 観点ごとに見ること。 */
const RUBRIC: Readonly<Record<CriterionKey, string>> = {
  structure:
    'topic sentence が最初にあり意見がはっきりしているか／理由が transition words（First, Second など）で示されているか／各理由に例・詳細があるか／concluding sentence が意見を言い換えて締めているか／1 つの段落としてまとまっているか',
  content:
    '理由に説得力があるか／例が具体的で理由を支えているか／テーマからそれていないか／論理の飛躍が無いか',
  grammar:
    '時制・主語と動詞の一致・冠詞・単数と複数・文の組み立て（run-on sentence や fragment）・句読点・綴り',
  vocabulary:
    '語の選び方が適切か／同じ語の繰り返しが多すぎないか／transition words の使い方／自然な語の組み合わせ（collocation）',
  requirements:
    '語数・文数の指定を満たしているか（下に示すアプリが数えた値で判断する）／構成や表現の条件を守っているか／英語だけで書いているか（日本語が混じっていれば必ず指摘する）',
}

export const SYSTEM_PROMPT = [
  'あなたは英語を第二言語として学ぶ日本人の大人を教える ESL のライティングの先生です。',
  '生徒が授業の課題で書いた opinion paragraph（英語の 1 段落）を、次の固定の基準で 100 点満点で採点します。',
  '',
  '## 基準（観点・満点・見ること）',
  ...CRITERIA.map((c) => `- ${c.label}（${c.key}）${c.max} 点: ${RUBRIC[c.key]}`),
  '',
  '## 守ること',
  '- 指摘のヒント（hint）は、何が問題か・何を確かめればよいかを日本語で短く伝えます（例: 「主語が三人称単数のときの動詞の形を確かめよう」「この理由を支える具体的な例を 1 文足そう」）。',
  '- 指摘の fix には、**修正例の英文**を書きます。quote があるときは、引用した箇所を正しく直した英文です（指摘した誤りのほかに綴りなどの誤りがあれば、それも直します）。生徒の言いたいことと語はできるだけ残し、必要なところだけを直します。quote が空のときは、足す文・直す文の例を 1 文で示せるなら英文を書き、示せないなら空文字にします。fix は英文だけにし、説明は hint に書きます。',
  '- 段落全体を書き直した文は、どこにも書かないでください。',
  '- 指摘の quote には、問題のある箇所を生徒の本文から**1 文字も変えずに**（誤りもそのまま）短く（15 語まで）抜き出します。誤りを直した形で引用してはいけません（直した形は fix に書きます）。本文全体や構成についての指摘で特定の箇所が無いときは空文字にします。',
  '- **綴りの誤り（誤字）は、findings には挙げず、spellings にまとめて全部挙げます**。wrong は本文の綴りを 1 文字も変えずに（1 語ずつ）、right はその正しい綴りです。同じ誤りは 1 回だけ、本文に出てくる順に挙げます。綴りの誤りが無ければ空の配列にします。文法の誤り（動詞の形・単数と複数など）や語の選び方は綴りの誤りではないので、findings に挙げます。綴りの誤りの多さは文法（grammar）の点数に反映します。',
  '- 生徒のタイトル（本文とは別に渡します）も見ます。タイトルの綴りの誤りは spellings に、内容に合っていない・文になっているなどの問題は findings に挙げます（quote はタイトルから抜き出してかまいません）。点数は本文で付け、語数・文数にタイトルは数えません。タイトルが無いことは、課題の条件で求められていない限り指摘しません。',
  '- 指摘は大事なものから、多くても 10 個まで。同じ種類の誤りが何度もあるときは 1 つにまとめ、ヒントで「ほかにもある」と伝えます。',
  '- 本文に日本語が混じっていれば、課題の条件（requirements）の指摘として必ず挙げます。',
  '- 観点ごとの comment は日本語 1〜2 文。よかった点（strengths）は具体的に 1〜3 個、日本語で。',
  '- 点数は観点ごとの満点を超えない整数にします。基準に照らして甘くも辛くもなく、同じ本文なら同じ点になるように採点します。',
].join('\n')

export interface ScoringInput {
  assignment: Assignment
  draft: string
  /** STEP 3 のタイトル（空でもよい）。 */
  title: string
}

/** ユーザーのメッセージ（課題・アプリが数えた値・タイトル・本文）。 */
export function buildUserPrompt(input: ScoringInput): string {
  const { assignment, draft } = input
  const words = describeRange(assignment.words, '語') ?? '指定なし'
  const sentences = describeRange(assignment.sentences, '文') ?? '指定なし'
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
    '## 生徒のタイトル',
    titleLine(input.title) === '' ? '（なし）' : `<title>${titleLine(input.title)}</title>`,
    '',
    '## 生徒の本文',
    '<paragraph>',
    draft.trim(),
    '</paragraph>',
  ].join('\n')
}

const scoreSchema = {
  type: 'object',
  properties: { score: { type: 'integer' }, comment: { type: 'string' } },
  required: ['score', 'comment'],
  additionalProperties: false,
}

/** 構造化出力の JSON スキーマ。 */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: Object.fromEntries(CRITERION_KEYS.map((key) => [key, scoreSchema])),
      required: [...CRITERION_KEYS],
      additionalProperties: false,
    },
    strengths: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string', enum: [...CRITERION_KEYS] },
          quote: { type: 'string' },
          hint: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['criterion', 'quote', 'hint', 'fix'],
        additionalProperties: false,
      },
    },
    spellings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { wrong: { type: 'string' }, right: { type: 'string' } },
        required: ['wrong', 'right'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores', 'strengths', 'findings', 'spellings'],
  additionalProperties: false,
} as const

export interface ScoringOutput {
  scores: Record<CriterionKey, CriterionScore>
  strengths: string[]
  findings: Finding[]
  spellings: Spelling[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 空白の続きを 1 つにする（引用が本文にあるかを比べるため）。 */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * 本文に無い引用は消す（ヒントと修正例は残す）。引用は直す前の文として修正例と並べて見せるので、
 * AI が誤りを直した形で引用したものは出さない。
 * 空白の違いだけは許す。
 */
export function dropUnquotable(findings: readonly Finding[], draft: string): Finding[] {
  const text = squash(draft)
  return findings.map((f) =>
    f.quote === '' || text.includes(squash(f.quote)) ? f : { ...f, quote: '' },
  )
}

/**
 * 本文に無い綴り（AI が直した形や、違う語を挙げたもの）は消す。語として出てくるかを見る
 * （ほかの語の一部は数えない）。大文字・小文字の違いは許す。
 */
export function dropUnknownSpellings(spellings: readonly Spelling[], draft: string): Spelling[] {
  return spellings.filter((s) => {
    const escaped = s.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(draft)
  })
}

/** 綴りの誤りの上限。 */
const MAX_SPELLINGS = 30

/** 指摘の上限（プロンプトでも 10 個までと頼んでいる）。 */
const MAX_FINDINGS = 10

/** AI の出力（JSON の文字列）を検証する。観点が欠けていれば `AiOutputError`。点数は 0〜満点に収める。 */
export function parseScoringOutput(text: string): ScoringOutput {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AiOutputError('採点の結果を JSON として読めません')
  }
  if (!isRecord(value) || !isRecord(value['scores'])) {
    throw new AiOutputError('採点の結果に scores がありません')
  }
  const raw = value['scores']
  const scores = {} as Record<CriterionKey, CriterionScore>
  for (const key of CRITERION_KEYS) {
    const item = raw[key]
    if (!isRecord(item) || typeof item['score'] !== 'number') {
      throw new AiOutputError(`採点の結果に ${key} の点数がありません`)
    }
    scores[key] = {
      score: clampScore(key, item['score']),
      comment: typeof item['comment'] === 'string' ? item['comment'].trim() : '',
    }
  }
  const strengths = Array.isArray(value['strengths'])
    ? value['strengths']
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim())
        .slice(0, 3)
    : []
  const findings = Array.isArray(value['findings'])
    ? value['findings']
        .flatMap((f): Finding[] =>
          isRecord(f) &&
          isCriterionKey(f['criterion']) &&
          typeof f['hint'] === 'string' &&
          f['hint'].trim() !== ''
            ? [
                {
                  criterion: f['criterion'],
                  quote: typeof f['quote'] === 'string' ? f['quote'].trim() : '',
                  hint: f['hint'].trim(),
                  fix: typeof f['fix'] === 'string' ? f['fix'].trim() : '',
                },
              ]
            : [],
        )
        .slice(0, MAX_FINDINGS)
    : []
  const seen = new Set<string>()
  const spellings = Array.isArray(value['spellings'])
    ? value['spellings']
        .flatMap((s): Spelling[] => {
          if (!isRecord(s) || typeof s['wrong'] !== 'string' || typeof s['right'] !== 'string') {
            return []
          }
          const wrong = s['wrong'].trim()
          const right = s['right'].trim()
          const key = wrong.toLowerCase()
          // 空・直っていない・重複は捨てる
          if (wrong === '' || right === '' || wrong === right || seen.has(key)) return []
          seen.add(key)
          return [{ wrong, right }]
        })
        .slice(0, MAX_SPELLINGS)
    : []
  return { scores, strengths, findings, spellings }
}
