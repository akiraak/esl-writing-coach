import Anthropic from '@anthropic-ai/sdk'
import { registerSecret } from '../log.js'
import type { IdeaSuggestions, ThemeSuggestion } from '../shared/ideas.js'
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
  buildUserPrompt,
  OUTPUT_SCHEMA,
  parseScoringOutput,
  type ScoringInput,
  type ScoringOutput,
  SYSTEM_PROMPT,
} from './scoring.js'

/**
 * Anthropic API の呼び出し（採点・アイデア出し。`docs/plans/archive/ai-scoring.md`・`ai-ideas.md`）。
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
  user: string
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
        messages: [{ role: 'user', content: request.user }],
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
  }
}
