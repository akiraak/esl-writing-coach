import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ai } from '../ai/client.js'
import { AiApiError, AiOutputError, AiRefusedError } from '../ai/errors.js'
import { dropUnquotable } from '../ai/scoring.js'
import { describeError, log } from '../log.js'
import { createFeedbackReader, type FeedbackReader } from '../paragraphs/feedbacks.js'
import {
  FeedbackConflictError,
  InvalidParagraphIdError,
  NEW_FILE_FORMAT,
  type ParagraphStore,
  STAGES,
  type Stage,
  StageConflictError,
} from '../paragraphs/store.js'
import { StageTextError, type StageTextFormat } from '../paragraphs/text.js'
import { createThemeReader, type ThemeReader } from '../paragraphs/themes.js'
import { emptyAssignment, parseAssignment, serializeAssignment } from '../shared/assignment.js'
import { type Feedback, parseFeedback, totalOf } from '../shared/feedback.js'

/**
 * JSON の API（`/api/...`）。保存層（`src/paragraphs/store.ts`）をそのまま呼ぶ。
 *
 * | メソッド・パス | 内容 |
 * |---|---|
 * | `GET /api/paragraphs` | 一覧（各項目に `assignment.md` のテーマ `theme` を足す） |
 * | `POST /api/paragraphs` `{ theme }` | 新規作成（テーマだけを入れた `assignment.md` も書く）→ `{ id }` |
 * | `DELETE /api/paragraphs/:id` | 削除 |
 * | `GET /api/paragraphs/:id/stages/:stage` | 段階のファイル → `{ text, rev, format }` |
 * | `PUT /api/paragraphs/:id/stages/:stage` `{ text, rev, format }` | 保存 → `{ rev, size, serverModified }`。競合は 409 |
 * | `GET /api/paragraphs/:id/feedback` | AI の採点の結果 → `{ feedback, aiConfigured }`（無ければ `feedback: null`） |
 * | `POST /api/paragraphs/:id/feedback` | 保存されている下書きを AI で採点し、`feedback.json` に書いて返す → `{ feedback }` |
 *
 * | `GET /api/review` | 振り返り: 採点のあるパラグラフごとの最新の採点とテーマ → `{ entries }`（集計はブラウザ。`src/shared/review.ts`） |
 * | `POST /api/ai/themes` `{ hint }` | テーマの候補 → `{ themes }`（`hint` は分野・キーワード。空でもよい） |
 * | `POST /api/ai/ideas` `{ theme, conditions }` | 賛成・反対の理由と例の候補 → `{ ideas }` |
 *
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

function parseFormat(value: unknown): StageTextFormat {
  if (
    isRecord(value) &&
    (value['eol'] === 'lf' || value['eol'] === 'crlf') &&
    typeof value['bom'] === 'boolean' &&
    typeof value['finalNewline'] === 'boolean'
  ) {
    return { eol: value['eol'], bom: value['bom'], finalNewline: value['finalNewline'] }
  }
  throw new HttpError(400, 'bad_format', 'format が不正です')
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
  /** 一覧のテーマを読む（rev で覚えておくので、サーバで 1 つを使い回す）。無ければリクエストごとに作る。 */
  themes?: ThemeReader
  /** 振り返りの feedback.json を読む（rev で覚えておくので、サーバで 1 つを使い回す）。無ければリクエストごとに作る。 */
  feedbacks?: FeedbackReader
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

/** 保存されている下書きを採点して `feedback.json` に書く。 */
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

async function scoreParagraph(id: string, options: ApiOptions): Promise<Feedback> {
  const { store } = options
  const ai = requireAi(options)
  const [assignment, draft] = await Promise.all([
    store.readStage(id, 'assignment'),
    store.readStage(id, 'draft'),
  ])
  if (draft.text.trim() === '') throw new HttpError(400, 'empty_draft', '下書きが空です')
  const { output, model } = await ai.score({
    assignment: parseAssignment(assignment.text),
    draft: draft.text,
  })
  const feedback: Feedback = {
    version: 1,
    scoredAt: (options.now ?? (() => new Date().toISOString()))(),
    model,
    draft: draft.text,
    total: totalOf(output.scores),
    ...output,
    // 本文に無い引用（直した形で引用されたもの）は消す
    findings: dropUnquotable(output.findings, draft.text),
  }
  const text = `${JSON.stringify(feedback, null, 2)}\n`
  // 最新の 1 回分だけを持つ。他の端末が同時に採点していたら、読み直した rev でもう一度だけ書く
  const write = async () =>
    store.saveFeedback(id, text, (await store.readFeedback(id))?.rev ?? null)
  try {
    await write()
  } catch (error) {
    if (!(error instanceof FeedbackConflictError)) throw error
    await write()
  }
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
        const themes = options.themes ?? createThemeReader(store)
        sendJson(res, 200, { paragraphs: await themes.withThemes(await store.listParagraphs()) })
        return
      }
      if (method === 'POST') {
        const body = await readJson(req)
        const theme = isRecord(body) ? body['theme'] : undefined
        if (typeof theme !== 'string' || theme.length > MAX_THEME_LENGTH) {
          throw new HttpError(400, 'bad_theme', 'theme が不正です')
        }
        const id = await store.createParagraph(today(), theme.trim())
        log.info(`作成: ${id}`)
        try {
          // 課題の画面を開いたときにテーマが入っているように（2026-11-08 決定）
          await store.saveStage(
            id,
            'assignment',
            serializeAssignment(emptyAssignment(theme.trim())),
            {
              rev: null,
              format: NEW_FILE_FORMAT,
            },
          )
        } catch (error) {
          // フォルダはできている。テーマは課題の画面で入れ直せるので、作成そのものは成功として返す
          log.warn(`作成した ${id} に assignment.md を書けません: ${describeError(error)}`)
        }
        sendJson(res, 201, { id })
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = PARAGRAPH.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'DELETE') {
        await store.deleteParagraph(id)
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
        sendJson(res, 200, await store.readStage(id, stage))
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
        const saved = await store.saveStage(id, stage, body['text'], {
          rev,
          format: parseFormat(body['format']),
        })
        log.info(`保存: ${id}/${stage}（${saved.size} バイト）`)
        sendJson(res, 200, saved)
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = FEEDBACK.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'GET') {
        const file = await store.readFeedback(id)
        sendJson(res, 200, {
          feedback: file === null ? null : parseFeedback(file.text),
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

    if (pathname === '/api/review') {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const summaries = await store.listParagraphs()
      const listed = await (options.themes ?? createThemeReader(store)).withThemes(summaries)
      const themes = new Map(listed.map((p) => [p.id, p.theme]))
      const entries = await (options.feedbacks ?? createFeedbackReader(store)).entries(
        summaries,
        themes,
      )
      sendJson(res, 200, { entries })
      return
    }

    if (pathname === '/api/ai/themes' || pathname === '/api/ai/ideas') {
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const body = await readJson(req)
      const ai = requireAi(options)
      if (pathname === '/api/ai/themes') {
        const themes = await ai.suggestThemes(stringField(body, 'hint', 200))
        log.info(`テーマの候補: ${themes.length} 件`)
        sendJson(res, 200, { themes })
        return
      }
      const theme = stringField(body, 'theme', MAX_THEME_LENGTH).trim()
      if (theme === '') throw new HttpError(400, 'empty_theme', 'テーマが空です')
      const ideas = await ai.suggestIdeas({
        theme,
        conditions: stringField(body, 'conditions', 4000),
      })
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
    } else if (error instanceof StageConflictError) {
      log.warn(`競合: ${error.id}/${error.stage}`)
      sendJson(res, 409, { error: 'conflict', message: error.message })
    } else if (error instanceof AiRefusedError) {
      log.warn(`AI に断られました: ${pathname}`)
      sendJson(res, 422, { error: 'ai_refusal', message: error.message })
    } else if (error instanceof AiApiError || error instanceof AiOutputError) {
      log.error(`AI の呼び出しに失敗: ${pathname}: ${error.message}`)
      sendJson(res, 502, { error: 'ai_error', message: error.message })
    } else if (error instanceof StageTextError) {
      sendJson(res, 422, { error: 'not_utf8', message: error.message })
    } else {
      const message = describeError(error)
      log.error(`${method} ${pathname}: ${message}`)
      sendJson(res, 502, { error: 'dropbox', message })
    }
  }
}
