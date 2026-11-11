import type { DatabaseSync } from 'node:sqlite'
import { parseAssignment } from '../shared/assignment.js'
import { AI_KINDS, type AiKind, type AiQuestion } from '../shared/ideas.js'
import {
  type ParagraphListItem,
  type SavedStage,
  STAGES,
  type Stage,
  type StageContent,
} from '../shared/types.js'
import { transaction } from './database.js'
import { dateOfParagraphId, isParagraphId, paragraphIdCandidate } from './naming.js'

export {
  type ParagraphListItem,
  type SavedStage,
  STAGES,
  type Stage,
  type StageContent,
} from '../shared/types.js'

/**
 * パラグラフの読み書き（ローカルの SQLite。表は `database.ts`。`docs/plans/archive/sqlite-storage.md`）。
 *
 * - 段階（課題・アウトライン・下書き）は 1 行ずつ持ち、**保存も競合の判定も段階ごと**に行う
 * - `rev` は保存のたびに 1 増える `version` の文字列。`rev` が合わなければ上書きせず `StageConflictError`。
 *   `rev` が null の保存は「まだ無いときだけ作る」（タブを 2 つ開いて同時に書いたときの上書きを防ぐ）
 * - 削除は印（`deleted_at`）を付けるだけ。一覧にも読み込みにも出さず、同じ id は使い回さない
 * - 段階が「無い・空」なら未着手（一覧の進み具合）
 */

/** id の重複を避けて試す回数の上限。 */
const MAX_CREATE_ATTEMPTS = 50

export class InvalidParagraphIdError extends Error {
  override name = 'InvalidParagraphIdError'
}

/** 無い（消した）パラグラフ。 */
export class ParagraphNotFoundError extends Error {
  override name = 'ParagraphNotFoundError'
}

/** 保存しようとしたら、他（別のタブ）が先に書いていた。上書きはしていない。 */
export class StageConflictError extends Error {
  override name = 'StageConflictError'
  readonly id: string
  readonly stage: Stage

  constructor(id: string, stage: Stage) {
    super(`${id} の ${stage} は他で更新されています（上書きしていません）`)
    this.id = id
    this.stage = stage
  }
}

export interface ParagraphStore {
  /** 新しく保存した順（同じなら id の降順）。テーマは課題の本文から読む。 */
  listParagraphs(): ParagraphListItem[]
  readStage(id: string, stage: Stage): StageContent
  saveStage(id: string, stage: Stage, text: string, rev: string | null): SavedStage
  /** パラグラフを作り、課題の本文（テーマだけ）も入れて id を返す。同名があれば `-2`, `-3` … を付ける。 */
  createParagraph(date: string, theme: string, assignmentText: string): string
  /** 印を付けて一覧から外す。既に無ければ何もしない。 */
  deleteParagraph(id: string): void
  /** AI の採点の最新の結果（JSON）。無ければ null。中身の解釈は呼び出し側（`parseFeedback`）。 */
  readFeedback(id: string): string | null
  saveFeedback(id: string, json: string): void
  /** 採点のある全パラグラフ（振り返り）。 */
  listFeedbacks(): { id: string; theme: string; json: string }[]
  /** AI案（種類ごとの最新の 1 回分の JSON）。 */
  readAiResults(id: string): Partial<Record<AiKind, string>>
  /** AI案を書く（その種類の質問と答えは消す）。パラグラフが無ければ（呼び出し中に消した）何もしない。 */
  saveAiResult(id: string, kind: AiKind, json: string): void
  /** AI案への質問と答え（種類ごとに古い順）。 */
  readAiQuestions(id: string): Record<AiKind, AiQuestion[]>
  /** AI案への質問と答えを足す（その種類の最後に）。 */
  addAiQuestion(id: string, kind: AiKind, question: string, answer: string): AiQuestion
  /** STEP 3 の「AI に質問」のやりとり（古い順）。 */
  readDraftQuestions(id: string): AiQuestion[]
  /** 「AI に質問」のやりとりを足す（最後に）。 */
  addDraftQuestion(id: string, question: string, answer: string): AiQuestion
  /** 「AI に質問」のやりとりを全部消す（はじめから）。 */
  clearDraftQuestions(id: string): void
}

export interface StoreOptions {
  /** 保存の時刻。差し替えられるのはテストのため。 */
  now?: () => string
}

function assertId(id: string): void {
  if (!isParagraphId(id)) throw new InvalidParagraphIdError(`パラグラフの id が不正です: ${id}`)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function createParagraphStore(db: DatabaseSync, options: StoreOptions = {}): ParagraphStore {
  const now = options.now ?? (() => new Date().toISOString())

  const exists = db.prepare('SELECT 1 FROM paragraphs WHERE id = ? AND deleted_at IS NULL')
  /** 消したものも含めてあるか（id を使い回さないため）。 */
  const taken = db.prepare('SELECT 1 FROM paragraphs WHERE id = ?')

  function assertExists(id: string): void {
    assertId(id)
    if (exists.get(id) === undefined)
      throw new ParagraphNotFoundError(`パラグラフがありません: ${id}`)
  }

  const listRows = db.prepare(`
    SELECT p.id, p.created_on, p.created_at, s.stage, s.text, s.updated_at
    FROM paragraphs p LEFT JOIN stages s ON s.paragraph_id = p.id
    WHERE p.deleted_at IS NULL
  `)

  function listParagraphs(): ParagraphListItem[] {
    const byId = new Map<string, ParagraphListItem>()
    for (const row of listRows.all()) {
      const id = str(row['id'])
      let item = byId.get(id)
      if (item === undefined) {
        item = {
          id,
          createdOn: str(row['created_on']) || (dateOfParagraphId(id) ?? ''),
          updatedAt: str(row['created_at']),
          started: { assignment: false, outline: false, draft: false },
          theme: '',
        }
        byId.set(id, item)
      }
      const stage = STAGES.find((s) => s === row['stage'])
      if (stage === undefined) continue
      const text = str(row['text'])
      item.started[stage] = text !== ''
      if (stage === 'assignment') item.theme = parseAssignment(text).theme
      const updatedAt = str(row['updated_at'])
      // ISO8601（UTC）なので文字列の大小で比べられる
      if (updatedAt > item.updatedAt) item.updatedAt = updatedAt
    }
    return [...byId.values()].sort((a, b) =>
      a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
    )
  }

  const selectStage = db.prepare(
    'SELECT text, version FROM stages WHERE paragraph_id = ? AND stage = ?',
  )

  function readStage(id: string, stage: Stage): StageContent {
    assertExists(id)
    const row = selectStage.get(id, stage)
    if (row === undefined) return { text: '', rev: null }
    return { text: str(row['text']), rev: String(row['version']) }
  }

  const insertStage = db.prepare(`
    INSERT INTO stages (paragraph_id, stage, text, version, updated_at) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT (paragraph_id, stage) DO NOTHING
  `)
  const updateStage = db.prepare(`
    UPDATE stages SET text = ?, version = version + 1, updated_at = ?
    WHERE paragraph_id = ? AND stage = ? AND version = ?
  `)

  function saveStage(id: string, stage: Stage, text: string, rev: string | null): SavedStage {
    assertExists(id)
    const updatedAt = now()
    if (rev === null) {
      if (insertStage.run(id, stage, text, updatedAt).changes === 0) {
        throw new StageConflictError(id, stage)
      }
      return { rev: '1', updatedAt }
    }
    const version = Number(rev)
    // 数字でない rev（Dropbox の頃に開いたままのタブなど）は合わないものとして扱う
    if (!Number.isSafeInteger(version)) throw new StageConflictError(id, stage)
    if (updateStage.run(text, updatedAt, id, stage, version).changes === 0) {
      throw new StageConflictError(id, stage)
    }
    return { rev: String(version + 1), updatedAt }
  }

  const insertParagraph = db.prepare(
    'INSERT INTO paragraphs (id, created_on, created_at) VALUES (?, ?, ?)',
  )

  function createParagraph(date: string, theme: string, assignmentText: string): string {
    return transaction(db, () => {
      for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
        const id = paragraphIdCandidate(date, theme, attempt)
        if (taken.get(id) !== undefined) continue
        const at = now()
        insertParagraph.run(id, date, at)
        insertStage.run(id, 'assignment', assignmentText, at)
        return id
      }
      throw new Error(`id が重複し続けて作れません（${date} / ${MAX_CREATE_ATTEMPTS} 回）`)
    })
  }

  const markDeleted = db.prepare(
    'UPDATE paragraphs SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
  )

  function deleteParagraph(id: string): void {
    assertId(id)
    markDeleted.run(now(), id)
  }

  const selectFeedback = db.prepare('SELECT json FROM feedbacks WHERE paragraph_id = ?')
  const upsertFeedback = db.prepare(`
    INSERT INTO feedbacks (paragraph_id, json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (paragraph_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
  `)
  const allFeedbacks = db.prepare(`
    SELECT p.id, f.json, s.text AS assignment
    FROM feedbacks f
    JOIN paragraphs p ON p.id = f.paragraph_id AND p.deleted_at IS NULL
    LEFT JOIN stages s ON s.paragraph_id = p.id AND s.stage = 'assignment'
  `)

  function readFeedback(id: string): string | null {
    assertExists(id)
    const row = selectFeedback.get(id)
    return row === undefined ? null : str(row['json'])
  }

  function saveFeedback(id: string, json: string): void {
    assertExists(id)
    upsertFeedback.run(id, json, now())
  }

  function listFeedbacks(): { id: string; theme: string; json: string }[] {
    return allFeedbacks.all().map((row) => ({
      id: str(row['id']),
      theme: parseAssignment(str(row['assignment'])).theme,
      json: str(row['json']),
    }))
  }

  const selectAi = db.prepare('SELECT kind, json FROM ai_results WHERE paragraph_id = ?')
  const upsertAi = db.prepare(`
    INSERT INTO ai_results (paragraph_id, kind, json, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (paragraph_id, kind) DO UPDATE SET json = excluded.json, created_at = excluded.created_at
  `)

  function readAiResults(id: string): Partial<Record<AiKind, string>> {
    assertExists(id)
    const results: Partial<Record<AiKind, string>> = {}
    for (const row of selectAi.all(id)) {
      const kind = row['kind']
      if (kind === 'themes' || kind === 'ideas' || kind === 'outline') {
        results[kind] = str(row['json'])
      }
    }
    return results
  }

  const clearQuestions = db.prepare('DELETE FROM ai_questions WHERE paragraph_id = ? AND kind = ?')

  function saveAiResult(id: string, kind: AiKind, json: string): void {
    assertId(id)
    if (exists.get(id) === undefined) return
    // 元の結果が変わると話がずれるので、その種類の質問は消す
    transaction(db, () => {
      upsertAi.run(id, kind, json, now())
      clearQuestions.run(id, kind)
    })
  }

  const selectQuestions = db.prepare(
    'SELECT kind, question, answer, created_at FROM ai_questions WHERE paragraph_id = ? ORDER BY kind, seq',
  )
  const insertQuestion = db.prepare(`
    INSERT INTO ai_questions (paragraph_id, kind, seq, question, answer, created_at)
    VALUES (?, ?, (SELECT coalesce(max(seq), 0) + 1 FROM ai_questions WHERE paragraph_id = ? AND kind = ?), ?, ?, ?)
  `)

  function readAiQuestions(id: string): Record<AiKind, AiQuestion[]> {
    assertExists(id)
    const questions = Object.fromEntries(AI_KINDS.map((k) => [k, [] as AiQuestion[]])) as Record<
      AiKind,
      AiQuestion[]
    >
    for (const row of selectQuestions.all(id)) {
      const kind = AI_KINDS.find((k) => k === row['kind'])
      if (kind === undefined) continue
      questions[kind].push({
        question: str(row['question']),
        answer: str(row['answer']),
        createdAt: str(row['created_at']),
      })
    }
    return questions
  }

  function addAiQuestion(id: string, kind: AiKind, question: string, answer: string): AiQuestion {
    assertExists(id)
    const createdAt = now()
    insertQuestion.run(id, kind, id, kind, question, answer, createdAt)
    return { question, answer, createdAt }
  }

  const selectDraftQuestions = db.prepare(
    'SELECT question, answer, created_at FROM draft_questions WHERE paragraph_id = ? ORDER BY seq',
  )
  const insertDraftQuestion = db.prepare(`
    INSERT INTO draft_questions (paragraph_id, seq, question, answer, created_at)
    VALUES (?, (SELECT coalesce(max(seq), 0) + 1 FROM draft_questions WHERE paragraph_id = ?), ?, ?, ?)
  `)
  const deleteDraftQuestions = db.prepare('DELETE FROM draft_questions WHERE paragraph_id = ?')

  function readDraftQuestions(id: string): AiQuestion[] {
    assertExists(id)
    return selectDraftQuestions.all(id).map((row) => ({
      question: str(row['question']),
      answer: str(row['answer']),
      createdAt: str(row['created_at']),
    }))
  }

  function addDraftQuestion(id: string, question: string, answer: string): AiQuestion {
    assertExists(id)
    const createdAt = now()
    insertDraftQuestion.run(id, id, question, answer, createdAt)
    return { question, answer, createdAt }
  }

  function clearDraftQuestions(id: string): void {
    assertExists(id)
    deleteDraftQuestions.run(id)
  }

  return {
    listParagraphs,
    readStage,
    saveStage,
    createParagraph,
    deleteParagraph,
    readFeedback,
    saveFeedback,
    listFeedbacks,
    readAiResults,
    saveAiResult,
    readAiQuestions,
    addAiQuestion,
    readDraftQuestions,
    addDraftQuestion,
    clearDraftQuestions,
  }
}
