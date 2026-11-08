import type { IncomingMessage, ServerResponse } from 'node:http'
import { describeError, log } from '../log.js'
import {
  InvalidParagraphIdError,
  type ParagraphStore,
  STAGES,
  type Stage,
  StageConflictError,
} from '../paragraphs/store.js'
import { StageTextError, type StageTextFormat } from '../paragraphs/text.js'

/**
 * JSON の API（`/api/...`）。保存層（`src/paragraphs/store.ts`）をそのまま呼ぶ。
 *
 * | メソッド・パス | 内容 |
 * |---|---|
 * | `GET /api/paragraphs` | 一覧 |
 * | `POST /api/paragraphs` `{ theme }` | 新規作成 → `{ id }` |
 * | `DELETE /api/paragraphs/:id` | 削除 |
 * | `GET /api/paragraphs/:id/stages/:stage` | 段階のファイル → `{ text, rev, format }` |
 * | `PUT /api/paragraphs/:id/stages/:stage` `{ text, rev, format }` | 保存 → `{ rev, size, serverModified }`。競合は 409 |
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
  /** 新規作成の作成日。差し替えられるのはテストのため。 */
  today?: () => string
}

const PARAGRAPHS = /^\/api\/paragraphs$/
const PARAGRAPH = /^\/api\/paragraphs\/([^/]+)$/
const STAGE = /^\/api\/paragraphs\/([^/]+)\/stages\/([^/]+)$/

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
        sendJson(res, 200, { paragraphs: await store.listParagraphs() })
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

    throw new HttpError(404, 'not_found', 'ありません')
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.code, message: error.message })
    } else if (error instanceof InvalidParagraphIdError) {
      sendJson(res, 400, { error: 'bad_id', message: error.message })
    } else if (error instanceof StageConflictError) {
      log.warn(`競合: ${error.id}/${error.stage}`)
      sendJson(res, 409, { error: 'conflict', message: error.message })
    } else if (error instanceof StageTextError) {
      sendJson(res, 422, { error: 'not_utf8', message: error.message })
    } else {
      const message = describeError(error)
      log.error(`${method} ${pathname}: ${message}`)
      sendJson(res, 502, { error: 'dropbox', message })
    }
  }
}
