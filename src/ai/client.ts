import Anthropic from '@anthropic-ai/sdk'
import { registerSecret } from '../log.js'
import type { IdeaSuggestions, OutlineReview, ThemeSuggestion } from '../shared/ideas.js'
import {
  buildDraftChatMessages,
  type ChatMessage,
  DRAFT_CHAT_SCHEMA,
  DRAFT_CHAT_SYSTEM,
  type DraftChatInput,
  parseDraftAnswer,
} from './draft-chat.js'
import { AiApiError, AiRefusedError } from './errors.js'
import {
  buildIdeasPrompt,
  buildThemesPrompt,
  IDEAS_SCHEMA,
  IDEAS_SYSTEM,
  type IdeasInput,
  parseIdeas,
  parseThemes,
  THEMES_SCHEMA,
  THEMES_SYSTEM,
} from './ideas.js'
import {
  buildOutlineReviewPrompt,
  OUTLINE_REVIEW_SCHEMA,
  OUTLINE_SYSTEM,
  type OutlineReviewInput,
  parseOutlineReview,
} from './outline-review.js'
import {
  buildQuestionPrompt,
  parseAnswer,
  QUESTION_SCHEMA,
  QUESTION_SYSTEM,
  type QuestionInput,
} from './questions.js'
import {
  buildUserPrompt,
  OUTPUT_SCHEMA,
  parseScoringOutput,
  type ScoringInput,
  type ScoringOutput,
  SYSTEM_PROMPT,
} from './scoring.js'
import {
  buildTranslationPrompt,
  parseTranslations,
  TRANSLATION_SCHEMA,
  TRANSLATION_SYSTEM,
} from './translation.js'

/**
 * Anthropic API の呼び出し（採点・アイデア出し・AI案への質問・STEP 3 の「AI に質問」・下書きの日本語訳。
 * `docs/plans/archive/ai-scoring.md`・`ai-ideas.md`・`ai-followup-questions.md`・`draft-chat.md`）。
 *
 * - モデルは Claude Opus 5.5。採点は effort `high`（ぶれを抑える）、アイデア出しは `medium`（速さを取る）
 * - 出力は構造化出力（JSON スキーマ）。拒否されたら別のモデルでやり直す（サーバ側の `fallbacks: "default"`）。
 *   それでも拒否なら `AiRefusedError`、SDK の失敗・途中で切れたら `AiApiError`（API の層が SDK に依存しないように包む）
 * - 本文はログに出さない
 */

export const AI_MODEL = 'claude-opus-5-5'

export interface ScoringResult {
  output: ScoringOutput
  /** 実際に採点したモデル（代わりのモデルが採点したらそのモデル）。 */
  model: string
}

export interface Ai {
  score(input: ScoringInput): Promise<ScoringResult>
  /** テーマの候補（`hint` は分野・キーワード。空でもよい）。 */
  suggestThemes(hint: string): Promise<ThemeSuggestion[]>
  /** 賛成・反対それぞれの理由と例の候補。 */
  suggestIdeas(input: IdeasInput): Promise<IdeaSuggestions>
  /** アウトラインへの指摘（ヒントだけ）。 */
  reviewOutline(input: OutlineReviewInput): Promise<OutlineReview>
  /** AI案の結果への質問に、日本語で答える（英文・直した項目は出さない）。 */
  answerQuestion(input: QuestionInput): Promise<string>
  /** STEP 3 の「AI に質問」: 下書きと課題を見て、自由な質問に答える（英語は制限しない）。 */
  answerDraftQuestion(input: DraftChatInput): Promise<string>
  /** 下書きの日本語訳（直訳に近く）。`sentences` の並びのとおりの訳を返す（返ってこなかった文は空）。 */
  translate(draft: string, sentences: readonly string[]): Promise<string[]>
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'API キーが正しくありません'
  if (error instanceof Anthropic.PermissionDeniedError)
    return 'API キーにこのモデルを使う権限がありません'
  if (error instanceof Anthropic.RateLimitError)
    return '呼び出しが多すぎます。少し待ってからもう一度'
  // APIConnectionError は APIError の子なので先に見る
  if (error instanceof Anthropic.APIConnectionError) return 'Anthropic API に繋がりません'
  if (error instanceof Anthropic.APIError)
    return `Anthropic API が失敗しました（HTTP ${error.status}）`
  return error instanceof Error ? error.message : String(error)
}

interface JsonRequest {
  system: string
  /** ユーザーのメッセージ 1 つ。続きの会話（「AI に質問」）のときはメッセージの並び。 */
  user: string | ChatMessage[]
  schema: { [key: string]: unknown }
  effort: 'medium' | 'high'
}

export function createAi(apiKey: string): Ai {
  registerSecret(apiKey)
  const client = new Anthropic({ apiKey })

  /** 1 回呼んで、構造化出力の JSON の文字列と、実際に答えたモデルを返す。 */
  async function callJson(request: JsonRequest): Promise<{ text: string; model: string }> {
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: {
          effort: request.effort,
          format: { type: 'json_schema', schema: request.schema },
        },
        system: request.system,
        messages:
          typeof request.user === 'string'
            ? [{ role: 'user', content: request.user }]
            : request.user,
      })
    } catch (error) {
      throw new AiApiError(describeApiError(error))
    }
    if (response.stop_reason === 'refusal') {
      throw new AiRefusedError('安全のための判定で断られました（代わりのモデルでも）')
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiApiError('結果が途中で切れました。もう一度お試しください')
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
    return { text, model: response.model }
  }

  return {
    async score(input) {
      const { text, model } = await callJson({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input),
        schema: OUTPUT_SCHEMA,
        effort: 'high',
      })
      return { output: parseScoringOutput(text), model }
    },
    async suggestThemes(hint) {
      const { text } = await callJson({
        system: THEMES_SYSTEM,
        user: buildThemesPrompt(hint),
        schema: THEMES_SCHEMA,
        effort: 'medium',
      })
      return parseThemes(text)
    },
    async suggestIdeas(input) {
      const { text } = await callJson({
        system: IDEAS_SYSTEM,
        user: buildIdeasPrompt(input),
        schema: IDEAS_SCHEMA,
        effort: 'medium',
      })
      return parseIdeas(text)
    },
    async reviewOutline(input) {
      const { text } = await callJson({
        system: OUTLINE_SYSTEM,
        user: buildOutlineReviewPrompt(input),
        schema: OUTLINE_REVIEW_SCHEMA,
        effort: 'medium',
      })
      return parseOutlineReview(text, input.outline)
    },
    async answerQuestion(input) {
      const { text } = await callJson({
        system: QUESTION_SYSTEM,
        user: buildQuestionPrompt(input),
        schema: QUESTION_SCHEMA,
        effort: 'medium',
      })
      return parseAnswer(text)
    },
    async answerDraftQuestion(input) {
      const { text } = await callJson({
        system: DRAFT_CHAT_SYSTEM,
        user: buildDraftChatMessages(input),
        schema: DRAFT_CHAT_SCHEMA,
        effort: 'medium',
      })
      return parseDraftAnswer(text)
    },
    async translate(draft, sentences) {
      const { text } = await callJson({
        system: TRANSLATION_SYSTEM,
        user: buildTranslationPrompt(draft, sentences),
        schema: TRANSLATION_SCHEMA,
        effort: 'medium',
      })
      return parseTranslations(text, sentences.length)
    },
  }
}
