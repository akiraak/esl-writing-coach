import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ai } from '../ai/client.js'
import { AiApiError, AiOutputError, AiRefusedError } from '../ai/errors.js'
import { dropUnquotable } from '../ai/scoring.js'
import { describeError, log } from '../log.js'
import { isParagraphId } from '../paragraphs/naming.js'
import {
  InvalidParagraphIdError,
  ParagraphNotFoundError,
  type ParagraphStore,
  STAGES,
  type Stage,
  StageConflictError,
} from '../paragraphs/store.js'
import { emptyAssignment, parseAssignment, serializeAssignment } from '../shared/assignment.js'
import { type Feedback, parseFeedback, totalOf } from '../shared/feedback.js'
import { AI_KINDS, type AiKind, type SavedAiResults } from '../shared/ideas.js'
import type { ReviewEntry } from '../shared/review.js'

/**
 * JSON の API（`/api/...`）。保存層（`src/paragraphs/store.ts`。SQLite）をそのまま呼ぶ。
 *
 * | メソッド・パス | 内容 |
 * |---|---|
 * | `GET /api/paragraphs` | 一覧（各項目に課題のテーマ `theme` を足す） |
 * | `POST /api/paragraphs` `{ theme }` | 新規作成（テーマだけを入れた課題も書く）→ `{ id }` |
 * | `DELETE /api/paragraphs/:id` | 削除（印を付けるだけ） |
 * | `GET /api/paragraphs/:id/stages/:stage` | 段階 → `{ text, rev }` |
 * | `PUT /api/paragraphs/:id/stages/:stage` `{ text, rev }` | 保存 → `{ rev, updatedAt }`。競合は 409 |
 * | `GET /api/paragraphs/:id/feedback` | AI の採点の結果 → `{ feedback, aiConfigured }`（無ければ `feedback: null`） |
 * | `POST /api/paragraphs/:id/feedback` | 保存されている下書きを AI で採点し、保存して返す → `{ feedback }` |
 * | `GET /api/paragraphs/:id/ai` | AI案（種類ごとの最新の 1 回分と、出したときの入力）→ `SavedAiResults` |
 * | `GET /api/review` | 振り返り: 採点のあるパラグラフごとの最新の採点とテーマ → `{ entries }`（集計はブラウザ。`src/shared/review.ts`） |
 * | `POST /api/ai/themes` `{ id?, hint }` | テーマの候補 → `{ themes }`（`hint` は分野・キーワード。空でもよい） |
 * | `POST /api/ai/ideas` `{ id?, theme, conditions }` | 賛成・反対の理由と例の候補 → `{ ideas }` |
 * | `POST /api/ai/outline` `{ id?, theme, conditions, outline }` | アウトラインへの指摘 → `{ review }`（アウトラインが空なら 400 `empty_outline`） |
 *
 * `/api/ai/*` に `id`（パラグラフ）を付けると、AI の呼び出しが終わったときにその AI案として保存する
 * （ブラウザが画面を離れていても残る。`docs/plans/sqlite-storage.md`）。
 *
 * 無いパラグラフは 404 `not_found`。
 * AI のエラー: キーが無い 503 `ai_not_configured` / 拒否 422 `ai_refusal` / API の失敗 502 `ai_error`。採点で下書きが空なら 400 `empty_draft`
 *
 * **本文はログに出さない**（パス・ステータスまで）。
 */

/** 受け取る本文の上限（パラグラフ 1 つには十分）。 */
export const MAX_BODY_BYTES = 1024 * 1024

/** テーマの長さの上限（フォルダ名に使うのは先頭の英数字だけだが、極端な入力は断る）。 */
export const MAX_THEME_LENGTH = 300

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(json)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', '本文が大きすぎます')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON として読めません')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStage(raw: string): Stage {
  const stage = STAGES.find((s) => s === raw)
  if (stage === undefined) throw new HttpError(400, 'bad_stage', `段階が不正です: ${raw}`)
  return stage
}

/** `YYYY-MM-DD`（サーバのローカル時刻。OS のタイムゾーンに従う）。 */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface ApiOptions {
  store: ParagraphStore
  /** AI（採点・アイデア出し）。`ANTHROPIC_API_KEY` が無ければ null。 */
  ai?: Ai | null
  /** 採点の時刻。差し替えられるのはテストのため。 */
  now?: () => string
  /** 新規作成の作成日。差し替えられるのはテストのため。 */
  today?: () => string
}

const PARAGRAPHS = /^\/api\/paragraphs$/
const PARAGRAPH = /^\/api\/paragraphs\/([^/]+)$/
const STAGE = /^\/api\/paragraphs\/([^/]+)\/stages\/([^/]+)$/
const FEEDBACK = /^\/api\/paragraphs\/([^/]+)\/feedback$/
const AI_RESULTS = /^\/api\/paragraphs\/([^/]+)\/ai$/

function requireAi(options: ApiOptions): Ai {
  const ai = options.ai ?? null
  if (ai === null) {
    throw new HttpError(503, 'ai_not_configured', 'ANTHROPIC_API_KEY が設定されていません')
  }
  return ai
}

/** 長さの上限つきの文字列の項目（無ければ空文字）。 */
function stringField(body: unknown, name: string, max: number): string {
  const value = isRecord(body) ? body[name] : undefined
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > max) {
    throw new HttpError(400, `bad_${name}`, `${name} が不正です`)
  }
  return value
}

/** AI案を保存するパラグラフ（`id`。無ければ null = 保存しない）。形が違えば 400。 */
function aiTarget(body: unknown): string | null {
  const id = stringField(body, 'id', 200)
  if (id === '') return null
  if (!isParagraphId(id)) throw new HttpError(400, 'bad_id', `パラグラフの id が不正です: ${id}`)
  return id
}

/** AI案を保存する（失敗しても AI の結果は返す。warn を出す）。 */
function saveAiResult(
  options: ApiOptions,
  id: string | null,
  kind: AiKind,
  value: Record<string, unknown>,
): void {
  if (id === null) return
  try {
    options.store.saveAiResult(id, kind, JSON.stringify({ ...value, createdAt: nowOf(options) }))
  } catch (error) {
    log.warn(`${id} の AI案（${kind}）を保存できません: ${describeError(error)}`)
  }
}

/** 保存してある AI案。壊れた JSON は無いものとして扱う。 */
function readAiResults(store: ParagraphStore, id: string): SavedAiResults {
  const raw = store.readAiResults(id)
  const results: SavedAiResults = { themes: null, ideas: null, outline: null }
  for (const kind of AI_KINDS) {
    const json = raw[kind]
    if (json === undefined) continue
    try {
      const value: unknown = JSON.parse(json)
      if (isRecord(value)) Object.assign(results, { [kind]: value })
    } catch {
      log.warn(`${id} の AI案（${kind}）を読めません`)
    }
  }
  return results
}

const nowOf = (options: ApiOptions) => (options.now ?? (() => new Date().toISOString()))()

/** 保存されている下書きを採点して保存する。 */
async function scoreParagraph(id: string, options: ApiOptions): Promise<Feedback> {
  const { store } = options
  const ai = requireAi(options)
  const assignment = store.readStage(id, 'assignment')
  const draft = store.readStage(id, 'draft')
  if (draft.text.trim() === '') throw new HttpError(400, 'empty_draft', '下書きが空です')
  const { output, model } = await ai.score({
    assignment: parseAssignment(assignment.text),
    draft: draft.text,
  })
  const feedback: Feedback = {
    version: 1,
    scoredAt: nowOf(options),
    model,
    draft: draft.text,
    total: totalOf(output.scores),
    ...output,
    // 本文に無い引用（直した形で引用されたもの）は消す
    findings: dropUnquotable(output.findings, draft.text),
  }
  // 最新の 1 回分だけを持つ
  store.saveFeedback(id, JSON.stringify(feedback))
  log.info(`採点: ${id}（${feedback.total} 点・${model}）`)
  return feedback
}

/** `/api/` のリクエストを処理する。 */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  options: ApiOptions,
): Promise<void> {
  const { store } = options
  const today = options.today ?? (() => localDate())
  const method = req.method ?? 'GET'
  try {
    let m: RegExpExecArray | null
    if (PARAGRAPHS.test(pathname)) {
      if (method === 'GET') {
        sendJson(res, 200, { paragraphs: store.listParagraphs() })
        return
      }
      if (method === 'POST') {
        const body = await readJson(req)
        const theme = isRecord(body) ? body['theme'] : undefined
        if (typeof theme !== 'string' || theme.length > MAX_THEME_LENGTH) {
          throw new HttpError(400, 'bad_theme', 'theme が不正です')
        }
        // 課題の画面を開いたときにテーマが入っているように（2026-11-08 決定）
        const id = store.createParagraph(
          today(),
          theme.trim(),
          serializeAssignment(emptyAssignment(theme.trim())),
        )
        log.info(`作成: ${id}`)
        sendJson(res, 201, { id })
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = PARAGRAPH.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'DELETE') {
        store.deleteParagraph(id)
        log.info(`削除: ${id}`)
        res.writeHead(204, { 'cache-control': 'no-store' }).end()
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = STAGE.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      const stage = parseStage(decodeURIComponent(m[2] ?? ''))
      if (method === 'GET') {
        sendJson(res, 200, store.readStage(id, stage))
        return
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        if (!isRecord(body) || typeof body['text'] !== 'string') {
          throw new HttpError(400, 'bad_text', 'text が不正です')
        }
        const rev = body['rev']
        if (rev !== null && (typeof rev !== 'string' || rev === '')) {
          throw new HttpError(400, 'bad_rev', 'rev が不正です')
        }
        const saved = store.saveStage(id, stage, body['text'], rev)
        log.info(`保存: ${id}/${stage}（${body['text'].length} 文字）`)
        sendJson(res, 200, saved)
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = FEEDBACK.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'GET') {
        const json = store.readFeedback(id)
        sendJson(res, 200, {
          feedback: json === null ? null : parseFeedback(json),
          aiConfigured: (options.ai ?? null) !== null,
        })
        return
      }
      if (method === 'POST') {
        await readJson(req)
        sendJson(res, 200, { feedback: await scoreParagraph(id, options) })
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = AI_RESULTS.exec(pathname)
    if (m !== null) {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      sendJson(res, 200, readAiResults(store, decodeURIComponent(m[1] ?? '')))
      return
    }

    if (pathname === '/api/review') {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const entries: ReviewEntry[] = []
      for (const row of store.listFeedbacks()) {
        const feedback = parseFeedback(row.json)
        // 読めない採点は飛ばす（振り返り全体は失敗させない）
        if (feedback === null) log.warn(`${row.id} の採点を読めません（形が違います）`)
        else entries.push({ id: row.id, theme: row.theme, feedback })
      }
      sendJson(res, 200, { entries })
      return
    }

    if (pathname === '/api/ai/outline') {
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const body = await readJson(req)
      const target = aiTarget(body)
      const ai = requireAi(options)
      const outline = stringField(body, 'outline', 20000)
      if (outline.trim() === '') throw new HttpError(400, 'empty_outline', 'アウトラインが空です')
      const input = {
        theme: stringField(body, 'theme', MAX_THEME_LENGTH),
        conditions: stringField(body, 'conditions', 4000),
        outline,
      }
      const review = await ai.reviewOutline(input)
      saveAiResult(options, target, 'outline', { ...input, review })
      log.info(`アウトラインの指摘: ${review.findings.length} 件`)
      sendJson(res, 200, { review })
      return
    }

    if (pathname === '/api/ai/themes' || pathname === '/api/ai/ideas') {
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const body = await readJson(req)
      const target = aiTarget(body)
      const ai = requireAi(options)
      if (pathname === '/api/ai/themes') {
        const hint = stringField(body, 'hint', 200)
        const themes = await ai.suggestThemes(hint)
        saveAiResult(options, target, 'themes', { hint, themes })
        log.info(`テーマの候補: ${themes.length} 件`)
        sendJson(res, 200, { themes })
        return
      }
      const theme = stringField(body, 'theme', MAX_THEME_LENGTH).trim()
      if (theme === '') throw new HttpError(400, 'empty_theme', 'テーマが空です')
      const conditions = stringField(body, 'conditions', 4000)
      const ideas = await ai.suggestIdeas({ theme, conditions })
      saveAiResult(options, target, 'ideas', { theme, conditions, ideas })
      log.info('理由・例の候補を出しました')
      sendJson(res, 200, { ideas })
      return
    }

    throw new HttpError(404, 'not_found', 'ありません')
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.code, message: error.message })
    } else if (error instanceof InvalidParagraphIdError) {
      sendJson(res, 400, { error: 'bad_id', message: error.message })
    } else if (error instanceof ParagraphNotFoundError) {
      sendJson(res, 404, { error: 'not_found', message: error.message })
    } else if (error instanceof StageConflictError) {
      log.warn(`競合: ${error.id}/${error.stage}`)
      sendJson(res, 409, { error: 'conflict', message: error.message })
    } else if (error instanceof AiRefusedError) {
      log.warn(`AI に断られました: ${pathname}`)
      sendJson(res, 422, { error: 'ai_refusal', message: error.message })
    } else if (error instanceof AiApiError || error instanceof AiOutputError) {
      log.error(`AI の呼び出しに失敗: ${pathname}: ${error.message}`)
      sendJson(res, 502, { error: 'ai_error', message: error.message })
    } else {
      const message = describeError(error)
      log.error(`${method} ${pathname}: ${message}`)
      sendJson(res, 500, { error: 'internal', message })
    }
  }
}
