import type { Feedback } from '../shared/feedback.js'
import type {
  AiKind,
  AiQuestion,
  IdeaSuggestions,
  OutlineReview,
  SavedAiResults,
  ThemeSuggestion,
} from '../shared/ideas.js'
import type { ReviewEntry } from '../shared/review.js'
import type { Translation } from '../shared/translation.js'
import type {
  ApiErrorBody,
  Doc,
  ParagraphListItem,
  SaveBase,
  SavedStage,
  StageContent,
} from '../shared/types.js'

/**
 * サーバの JSON API を呼ぶ（`src/server/api.ts`）。
 * 書き込みには `X-ESL-Request: 1` と JSON が要る（`src/server/guard.ts` の安全チェック）。
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? `HTTP ${status}`)
    this.status = status
    this.code = body.error ?? 'unknown'
  }

  /** 他（別の端末・別のタブ）が先に保存していた。上書きはされていない。 */
  get isConflict(): boolean {
    return this.status === 409 && this.code === 'conflict'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} }
  if (method !== 'GET') {
    init.headers = { 'content-type': 'application/json', 'x-esl-request': '1' }
    init.body = JSON.stringify(body ?? {})
  }
  const res = await fetch(path, init)
  if (res.status === 204) return undefined as T
  const json: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, json as Partial<ApiErrorBody>)
  return json as T
}

const stagePath = (id: string, stage: Doc) =>
  `/api/paragraphs/${encodeURIComponent(id)}/stages/${stage}`

export async function listParagraphs(): Promise<ParagraphListItem[]> {
  return (await request<{ paragraphs: ParagraphListItem[] }>('GET', '/api/paragraphs')).paragraphs
}

export async function createParagraph(theme: string): Promise<string> {
  return (await request<{ id: string }>('POST', '/api/paragraphs', { theme })).id
}

export async function deleteParagraph(id: string): Promise<void> {
  await request<void>('DELETE', `/api/paragraphs/${encodeURIComponent(id)}`)
}

export async function readStage(id: string, stage: Doc): Promise<StageContent> {
  return request<StageContent>('GET', stagePath(id, stage))
}

/** 競合なら `ApiError`（`isConflict`）。 */
export async function saveStage(
  id: string,
  stage: Doc,
  text: string,
  base: SaveBase,
): Promise<SavedStage> {
  return request<SavedStage>('PUT', stagePath(id, stage), { text, ...base })
}

export interface FeedbackState {
  feedback: Feedback | null
  /** サーバに ANTHROPIC_API_KEY があるか。 */
  aiConfigured: boolean
}

export async function readFeedback(id: string): Promise<FeedbackState> {
  return request<FeedbackState>('GET', `/api/paragraphs/${encodeURIComponent(id)}/feedback`)
}

/** 保存されている下書きを採点する（数十秒かかる）。失敗は `ApiError`（`code` が `ai_refusal` など）。 */
export async function scoreParagraph(id: string): Promise<Feedback> {
  return (
    await request<{ feedback: Feedback }>(
      'POST',
      `/api/paragraphs/${encodeURIComponent(id)}/feedback`,
    )
  ).feedback
}

export interface TranslationState {
  translation: Translation | null
  /** サーバに ANTHROPIC_API_KEY があるか。 */
  aiConfigured: boolean
}

export async function readTranslation(id: string): Promise<TranslationState> {
  return request<TranslationState>('GET', `/api/paragraphs/${encodeURIComponent(id)}/translation`)
}

/** 保存されている下書きを文ごとに日本語に訳す。失敗は `ApiError`。 */
export async function translateParagraph(id: string): Promise<Translation> {
  return (
    await request<{ translation: Translation }>(
      'POST',
      `/api/paragraphs/${encodeURIComponent(id)}/translation`,
    )
  ).translation
}

/** パラグラフの AI案（種類ごとの最新の 1 回分と、出したときの入力）。 */
export async function readAiResults(id: string): Promise<SavedAiResults> {
  return request<SavedAiResults>('GET', `/api/paragraphs/${encodeURIComponent(id)}/ai`)
}

/**
 * テーマの候補（`hint` は分野・キーワード。空でもよい）。
 * 以下の AI案は `id` のパラグラフの AI案としてサーバが保存する（画面を離れても残る）。
 */
export async function suggestThemes(id: string, hint: string): Promise<ThemeSuggestion[]> {
  return (await request<{ themes: ThemeSuggestion[] }>('POST', '/api/ai/themes', { id, hint }))
    .themes
}

/** 賛成・反対の理由と例の候補。 */
export async function suggestIdeas(
  id: string,
  theme: string,
  conditions: string,
): Promise<IdeaSuggestions> {
  return (
    await request<{ ideas: IdeaSuggestions }>('POST', '/api/ai/ideas', { id, theme, conditions })
  ).ideas
}

/** 振り返り: 採点のあるパラグラフごとの最新の採点とテーマ。 */
export async function readReview(): Promise<ReviewEntry[]> {
  return (await request<{ entries: ReviewEntry[] }>('GET', '/api/review')).entries
}

/** アウトラインへの AI の指摘（ヒントだけ）。 */
export async function reviewOutline(
  id: string,
  theme: string,
  conditions: string,
  outline: string,
): Promise<OutlineReview> {
  return (
    await request<{ review: OutlineReview }>('POST', '/api/ai/outline', {
      id,
      theme,
      conditions,
      outline,
    })
  ).review
}

/** AI案の結果に質問する（答えはサーバが保存する）。失敗は `ApiError`（`code` が `too_many_questions` など）。 */
export async function askAiQuestion(
  id: string,
  kind: AiKind,
  question: string,
): Promise<AiQuestion> {
  return request<AiQuestion>(
    'POST',
    `/api/paragraphs/${encodeURIComponent(id)}/ai/${kind}/questions`,
    { question },
  )
}

/** STEP 3 の「AI に質問」（サーバが保存されている下書きと課題を読んで答え、保存する）。 */
export async function askDraftQuestion(id: string, question: string): Promise<AiQuestion> {
  return request<AiQuestion>('POST', `/api/paragraphs/${encodeURIComponent(id)}/draft/questions`, {
    question,
  })
}

/** 「AI に質問」のやりとりを消す（はじめから）。 */
export async function clearDraftQuestions(id: string): Promise<void> {
  await request<void>('DELETE', `/api/paragraphs/${encodeURIComponent(id)}/draft/questions`)
}
