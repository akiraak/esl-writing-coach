/**
 * AI の呼び出しの失敗（採点・アイデア出しで共通）。API の層はこれを HTTP のエラーに写す（`src/server/api.ts`）。
 */

/** 安全のための判定で断られた（代わりのモデルでも）。→ 422 `ai_refusal` */
export class AiRefusedError extends Error {
  override name = 'AiRefusedError'
}

/** API の呼び出しに失敗した・結果が途中で切れた。→ 502 `ai_error` */
export class AiApiError extends Error {
  override name = 'AiApiError'
}

/** 結果が期待した形でない（JSON として読めない・必要な項目が無い）。→ 502 `ai_error` */
export class AiOutputError extends Error {
  override name = 'AiOutputError'
}
