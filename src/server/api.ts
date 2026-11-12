import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ai } from '../ai/client.js'
import { AiApiError, AiOutputError, AiRefusedError } from '../ai/errors.js'
import type { QuestionContext } from '../ai/questions.js'
import { dropUnknownSpellings, dropUnquotable } from '../ai/scoring.js'
import { describeError, log } from '../log.js'
import { isParagraphId } from '../paragraphs/naming.js'
import {
  DOCS,
  type Doc,
  InvalidParagraphIdError,
  ParagraphNotFoundError,
  type ParagraphStore,
  StageConflictError,
} from '../paragraphs/store.js'
import { emptyAssignment, parseAssignment, serializeAssignment } from '../shared/assignment.js'
import { splitSentences } from '../shared/counting.js'
import { titleLine } from '../shared/export.js'
import { type Feedback, parseFeedback, totalOf } from '../shared/feedback.js'
import {
  AI_KINDS,
  type AiKind,
  type AiQuestion,
  isAiKind,
  MAX_DRAFT_QUESTIONS,
  MAX_QUESTION_LENGTH,
  MAX_QUESTIONS,
  type SavedAiResults,
} from '../shared/ideas.js'
import type { ReviewEntry } from '../shared/review.js'
import { parseTranslation, type Translation } from '../shared/translation.js'
import { MAX_TITLE_LENGTH } from '../shared/types.js'

/**
 * JSON の API（`/api/...`）。保存層（`src/paragraphs/store.ts`。SQLite）をそのまま呼ぶ。
 *
 * | メソッド・パス | 内容 |
 * |---|---|
 * | `GET /api/paragraphs` | 一覧（各項目に課題のテーマ `theme` を足す） |
 * | `POST /api/paragraphs` `{ theme }` | 新規作成（テーマだけを入れた課題も書く）→ `{ id }` |
 * | `DELETE /api/paragraphs/:id` | 削除（印を付けるだけ） |
 * | `GET /api/paragraphs/:id/stages/:stage` | 段階 → `{ text, rev }`（`:stage` は 3 つの段階と、STEP 3 のタイトル `title`） |
 * | `PUT /api/paragraphs/:id/stages/:stage` `{ text, rev }` | 保存 → `{ rev, updatedAt }`。競合は 409 |
 * | `GET /api/paragraphs/:id/feedback` | AI の採点の結果 → `{ feedback, aiConfigured }`（無ければ `feedback: null`） |
 * | `POST /api/paragraphs/:id/feedback` | 保存されている下書き（とタイトル）を AI で採点し、保存して返す → `{ feedback }` |
 * | `GET /api/paragraphs/:id/translation` | 下書きの日本語訳 → `{ translation, aiConfigured }`（無ければ `translation: null`） |
 * | `POST /api/paragraphs/:id/translation` | 保存されている下書きを文ごとに日本語に訳し（直訳に近く）、保存して返す → `{ translation }` |
 * | `GET /api/paragraphs/:id/ai` | AI案（種類ごとの最新の 1 回分と、出したときの入力・質問と答え）と「AI に質問」のやりとり → `SavedAiResults` |
 * | `POST /api/paragraphs/:id/ai/:kind/questions` `{ question }` | AI案への質問に答えて保存 → `{ question, answer, createdAt }` |
 * | `POST /api/paragraphs/:id/draft/questions` `{ question }` | STEP 3 の「AI に質問」: 保存されている下書きと課題を見て答え、保存 → `{ question, answer, createdAt }` |
 * | `DELETE /api/paragraphs/:id/draft/questions` | 「AI に質問」のやりとりを消す（はじめから） |
 * | `GET /api/review` | 振り返り: 採点のあるパラグラフごとの最新の採点とテーマ → `{ entries }`（集計はブラウザ。`src/shared/review.ts`） |
 * | `POST /api/ai/themes` `{ id?, hint }` | テーマの候補 → `{ themes }`（`hint` は分野・キーワード。空でもよい） |
 * | `POST /api/ai/ideas` `{ id?, theme, conditions }` | 賛成・反対の理由と例の候補 → `{ ideas }` |
 * | `POST /api/ai/outline` `{ id?, theme, conditions, outline }` | アウトラインへの指摘 → `{ review }`（アウトラインが空なら 400 `empty_outline`） |
 *
 * `/api/ai/*` に `id`（パラグラフ）を付けると、AI の呼び出しが終わったときにその AI案として保存する
 * （ブラウザが画面を離れていても残る。`docs/plans/archive/sqlite-storage.md`）。
 *
 * AI案への質問: 空・長すぎる 400 `bad_question`、その AI案がまだ無い 400 `no_result`、回数の上限 400 `too_many_questions`、
 * 答えを待つ間に AI案が出し直された 409 `result_changed`（質問は残さない）。
 *
 * 「AI に質問」（`docs/plans/archive/draft-chat.md`）: 空・長すぎる 400 `bad_question`、回数の上限 400 `too_many_questions`、
 * 答えを待つ間にやりとりが変わった（はじめからにした・別のタブで聞いた）409 `chat_changed`（質問は残さない）。下書きが空でも聞ける。
 *
 * 無いパラグラフは 404 `not_found`。
 * AI のエラー: キーが無い 503 `ai_not_configured` / 拒否 422 `ai_refusal` / API の失敗 502 `ai_error`。採点・日本語訳で下書きが空なら 400 `empty_draft`
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

function parseStage(raw: string): Doc {
  const stage = DOCS.find((s) => s === raw)
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
const TRANSLATION = /^\/api\/paragraphs\/([^/]+)\/translation$/
const AI_RESULTS = /^\/api\/paragraphs\/([^/]+)\/ai$/
const AI_QUESTIONS = /^\/api\/paragraphs\/([^/]+)\/ai\/([^/]+)\/questions$/
const DRAFT_QUESTIONS = /^\/api\/paragraphs\/([^/]+)\/draft\/questions$/

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
  const results: SavedAiResults = {
    themes: null,
    ideas: null,
    outline: null,
    questions: store.readAiQuestions(id),
    draftQuestions: store.readDraftQuestions(id),
  }
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

/** その種類の保存してある AI案（質問の元）。まだ無ければ null。 */
function questionContext(saved: SavedAiResults, kind: AiKind): QuestionContext | null {
  switch (kind) {
    case 'themes':
      return saved.themes === null ? null : { kind, saved: saved.themes }
    case 'ideas':
      return saved.ideas === null ? null : { kind, saved: saved.ideas }
    case 'outline':
      return saved.outline === null ? null : { kind, saved: saved.outline }
  }
}

/** AI案への質問に答え、保存して返す（`docs/plans/archive/ai-followup-questions.md`）。 */
async function askQuestion(
  id: string,
  rawKind: string,
  body: unknown,
  options: ApiOptions,
): Promise<AiQuestion> {
  const { store } = options
  if (!isAiKind(rawKind)) throw new HttpError(400, 'bad_kind', `AI案の種類が不正です: ${rawKind}`)
  const kind = rawKind
  const question = stringField(body, 'question', MAX_QUESTION_LENGTH).trim()
  if (question === '') throw new HttpError(400, 'bad_question', '質問が空です')
  const ai = requireAi(options)
  const saved = readAiResults(store, id)
  const context = questionContext(saved, kind)
  if (context === null) throw new HttpError(400, 'no_result', 'まだ AI案を出していません')
  const history = saved.questions[kind]
  if (history.length >= MAX_QUESTIONS) {
    throw new HttpError(400, 'too_many_questions', `質問は ${MAX_QUESTIONS} 回までです`)
  }
  const answer = await ai.answerQuestion({ context, history, question })
  // 答えを待つ間に AI案が出し直されていたら、元の結果が違うので残さない
  if (
    questionContext(readAiResults(store, id), kind)?.saved.createdAt !== context.saved.createdAt
  ) {
    throw new HttpError(409, 'result_changed', 'AI案が出し直されたので、質問は残していません')
  }
  log.info(`AI案への質問: ${id}/${kind}（${history.length + 1} 回目）`)
  return store.addAiQuestion(id, kind, question, answer)
}

/**
 * STEP 3 の「AI に質問」: 保存されている下書きと課題を読んで答え、保存して返す（`docs/plans/archive/draft-chat.md`）。
 * 下書きが空でも答える（書く前の相談）。
 */
async function askDraftQuestion(
  id: string,
  body: unknown,
  options: ApiOptions,
): Promise<AiQuestion> {
  const { store } = options
  const question = stringField(body, 'question', MAX_QUESTION_LENGTH).trim()
  if (question === '') throw new HttpError(400, 'bad_question', '質問が空です')
  // 無いパラグラフは、キーが無くても 404
  const history = store.readDraftQuestions(id)
  const ai = requireAi(options)
  if (history.length >= MAX_DRAFT_QUESTIONS) {
    throw new HttpError(
      400,
      'too_many_questions',
      `質問は ${MAX_DRAFT_QUESTIONS} 回までです。「はじめから」で消すと新しく聞けます`,
    )
  }
  const answer = await ai.answerDraftQuestion({
    assignment: parseAssignment(store.readStage(id, 'assignment').text),
    draft: store.readStage(id, 'draft').text,
    title: titleLine(store.readStage(id, 'title').text),
    history,
    question,
  })
  // 答えを待つ間に「はじめから」にした・別のタブで聞いたなら、話の続きではなくなるので残さない
  const current = store.readDraftQuestions(id)
  if (
    current.length !== history.length ||
    current.at(-1)?.createdAt !== history.at(-1)?.createdAt
  ) {
    throw new HttpError(409, 'chat_changed', 'やりとりが変わったので、質問は残していません')
  }
  log.info(`AI に質問: ${id}（${history.length + 1} 回目）`)
  return store.addDraftQuestion(id, question, answer)
}

const nowOf = (options: ApiOptions) => (options.now ?? (() => new Date().toISOString()))()

/** 保存されている下書きを採点して保存する。 */
async function scoreParagraph(id: string, options: ApiOptions): Promise<Feedback> {
  const { store } = options
  const ai = requireAi(options)
  const assignment = store.readStage(id, 'assignment')
  const draft = store.readStage(id, 'draft')
  if (draft.text.trim() === '') throw new HttpError(400, 'empty_draft', '下書きが空です')
  const title = titleLine(store.readStage(id, 'title').text)
  const { output, model } = await ai.score({
    assignment: parseAssignment(assignment.text),
    draft: draft.text,
    title,
  })
  // 引用・綴りはタイトルからでもよい
  const written = `${title}\n${draft.text}`
  const feedback: Feedback = {
    version: 1,
    scoredAt: nowOf(options),
    model,
    draft: draft.text,
    title,
    total: totalOf(output.scores),
    ...output,
    // 本文に無い引用（直した形で引用されたもの）は消す
    findings: dropUnquotable(output.findings, written),
    spellings: dropUnknownSpellings(output.spellings, written),
  }
  // 最新の 1 回分だけを持つ
  store.saveFeedback(id, JSON.stringify(feedback))
  log.info(`採点: ${id}（${feedback.total} 点・${model}）`)
  return feedback
}

/** 保存されている下書きを文ごとに日本語に訳して保存する（`docs/plans/archive/draft-translation.md`）。 */
async function translateParagraph(id: string, options: ApiOptions): Promise<Translation> {
  const { store } = options
  const ai = requireAi(options)
  const draft = store.readStage(id, 'draft').text
  const sentences = splitSentences(draft)
  if (sentences.length === 0) throw new HttpError(400, 'empty_draft', '下書きが空です')
  const title = titleLine(store.readStage(id, 'title').text)
  const translated = await ai.translate({ title, draft, sentences })
  const translation: Translation = {
    version: 1,
    translatedAt: nowOf(options),
    draft,
    title: title === '' ? null : { en: title, ja: translated.title },
    sentences: sentences.map((en, i) => ({ en, ja: translated.sentences[i] ?? '' })),
  }
  // 最新の 1 回分だけを持つ
  store.saveTranslation(id, JSON.stringify(translation))
  log.info(`日本語訳: ${id}（${sentences.length} 文）`)
  return translation
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
        // タイトルは 1 行（改行は空白に直す）
        const text =
          stage === 'title'
            ? body['text'].replace(/\s*[\r\n]+\s*/g, ' ').slice(0, MAX_TITLE_LENGTH)
            : body['text']
        const saved = store.saveStage(id, stage, text, rev)
        log.info(`保存: ${id}/${stage}（${text.length} 文字）`)
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

    m = TRANSLATION.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'GET') {
        const json = store.readTranslation(id)
        sendJson(res, 200, {
          translation: json === null ? null : parseTranslation(json),
          aiConfigured: (options.ai ?? null) !== null,
        })
        return
      }
      if (method === 'POST') {
        await readJson(req)
        sendJson(res, 200, { translation: await translateParagraph(id, options) })
        return
      }
      throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
    }

    m = AI_QUESTIONS.exec(pathname)
    if (m !== null) {
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', '使えないメソッドです')
      const body = await readJson(req)
      const id = decodeURIComponent(m[1] ?? '')
      sendJson(res, 200, await askQuestion(id, decodeURIComponent(m[2] ?? ''), body, options))
      return
    }

    m = DRAFT_QUESTIONS.exec(pathname)
    if (m !== null) {
      const id = decodeURIComponent(m[1] ?? '')
      if (method === 'POST') {
        const body = await readJson(req)
        sendJson(res, 200, await askDraftQuestion(id, body, options))
        return
      }
      if (method === 'DELETE') {
        store.clearDraftQuestions(id)
        log.info(`AI に質問: ${id} のやりとりを消しました`)
        res.writeHead(204, { 'cache-control': 'no-store' }).end()
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
