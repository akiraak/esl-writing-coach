import type { Feedback } from '../shared/feedback.js'
import type { IdeaSuggestions, ThemeSuggestion } from '../shared/ideas.js'
import type {
  ApiErrorBody,
  ParagraphListItem,
  SaveBase,
  SavedStage,
  Stage,
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

const stagePath = (id: string, stage: Stage) =>
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

export async function readStage(id: string, stage: Stage): Promise<StageContent> {
  return request<StageContent>('GET', stagePath(id, stage))
}

/** 競合なら `ApiError`（`isConflict`）。 */
export async function saveStage(
  id: string,
  stage: Stage,
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

/** テーマの候補（`hint` は分野・キーワード。空でもよい）。 */
export async function suggestThemes(hint: string): Promise<ThemeSuggestion[]> {
  return (await request<{ themes: ThemeSuggestion[] }>('POST', '/api/ai/themes', { hint })).themes
}

/** 賛成・反対の理由と例の候補。 */
export async function suggestIdeas(theme: string, conditions: string): Promise<IdeaSuggestions> {
  return (await request<{ ideas: IdeaSuggestions }>('POST', '/api/ai/ideas', { theme, conditions }))
    .ideas
}
