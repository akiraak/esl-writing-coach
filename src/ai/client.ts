import Anthropic from '@anthropic-ai/sdk'
import { registerSecret } from '../log.js'
import {
  buildUserPrompt,
  OUTPUT_SCHEMA,
  parseScoringOutput,
  type ScoringInput,
  type ScoringOutput,
  SYSTEM_PROMPT,
} from './scoring.js'

/**
 * AI の採点を 1 回呼ぶ（Anthropic API。`docs/plans/archive/ai-scoring.md`）。
 *
 * - モデルは Claude Opus 5.5・effort `high`（採点のぶれを抑える）。出力は構造化出力（JSON スキーマ）
 * - 拒否されたら別のモデルで採点し直す（サーバ側の `fallbacks: "default"`）。それでも拒否なら `ScoringRefusedError`
 * - SDK の失敗は `ScoringApiError` に包む（API の層が SDK に依存しないように）
 * - 本文はログに出さない
 */

export const SCORING_MODEL = 'claude-opus-5-5'

export interface ScoringResult {
  output: ScoringOutput
  /** 実際に採点したモデル（代わりのモデルが採点したらそのモデル）。 */
  model: string
}

export interface Scorer {
  score(input: ScoringInput): Promise<ScoringResult>
}

/** 安全のための判定で採点を断られた（代わりのモデルでも）。 */
export class ScoringRefusedError extends Error {
  override name = 'ScoringRefusedError'
}

/** API の呼び出しに失敗した・結果が途中で切れた。 */
export class ScoringApiError extends Error {
  override name = 'ScoringApiError'
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

export function createScorer(apiKey: string): Scorer {
  registerSecret(apiKey)
  const client = new Anthropic({ apiKey })
  return {
    async score(input) {
      let response: Anthropic.Beta.BetaMessage
      try {
        response = await client.beta.messages.create({
          model: SCORING_MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        })
      } catch (error) {
        throw new ScoringApiError(describeApiError(error))
      }
      if (response.stop_reason === 'refusal') {
        throw new ScoringRefusedError('安全のための判定で断られました（代わりのモデルでも）')
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ScoringApiError('採点の結果が途中で切れました。もう一度お試しください')
      }
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
      return { output: parseScoringOutput(text), model: response.model }
    },
  }
}
