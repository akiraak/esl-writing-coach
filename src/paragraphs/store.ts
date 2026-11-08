import { type DropboxClient, isConflictError, isNotFoundError } from '../dropbox/client.js'
import { dateOfParagraphId, isParagraphId, paragraphIdCandidate } from './naming.js'
import { decodeStageText, encodeStageText, type StageTextFormat } from './text.js'

/**
 * パラグラフの読み書き（Dropbox 上のファイル。`CLAUDE.md` の「ファイルの配置」）。
 *
 * ```
 * <root>/paragraphs/<id>/assignment.md | ideas.txt | outline.txt | draft.txt
 * ```
 *
 * - 段階ごとにファイルを分け、**保存も競合の判定もファイル単位**で行う
 * - 保存は `rev` があれば `update`、無ければ `add`。**上書き（overwrite）はしない**。
 *   `rev` が合わない・既にある、は `StageConflictError` にして呼び出し側に知らせる
 * - 新規作成ではフォルダだけを作る（空のファイルは作らない）。段階のファイルが「無い・0 バイト」なら未着手
 */

export const STAGES = ['assignment', 'ideas', 'outline', 'draft'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_FILES: Readonly<Record<Stage, string>> = {
  assignment: 'assignment.md',
  ideas: 'ideas.txt',
  outline: 'outline.txt',
  draft: 'draft.txt',
}

/** パラグラフのフォルダを並べるフォルダ（保存先の直下）。 */
export const PARAGRAPHS_DIR = 'paragraphs'

/** このアプリが新しく作るファイルの形式（LF・BOM なし・末尾の改行は足さない）。 */
export const NEW_FILE_FORMAT: StageTextFormat = { eol: 'lf', bom: false, finalNewline: false }

/** 1 回の list_folder で取る件数（Dropbox の上限は 2000）。 */
const LIST_LIMIT = 2000

/** フォルダ名の重複を避けて試す回数の上限。 */
const MAX_CREATE_ATTEMPTS = 50

export class InvalidParagraphIdError extends Error {
  override name = 'InvalidParagraphIdError'
}

/** 保存しようとしたら、他（別の端末・別のタブ）が先に書いていた。上書きはしていない。 */
export class StageConflictError extends Error {
  override name = 'StageConflictError'
  readonly id: string
  readonly stage: Stage

  constructor(id: string, stage: Stage) {
    super(`${id} の ${STAGE_FILES[stage]} は他で更新されています（上書きしていません）`)
    this.id = id
    this.stage = stage
  }
}

export interface StageFileInfo {
  rev: string
  size: number
  /** サーバ側の更新時刻（ISO8601）。 */
  serverModified: string
}

export interface ParagraphSummary {
  /** フォルダ名。 */
  id: string
  /** 作成日（フォルダ名の先頭。`YYYY-MM-DD`）。 */
  createdOn: string
  /** 段階のファイルの最新の更新時刻。ファイルが 1 つも無ければ作成日の 0 時（UTC）。 */
  updatedAt: string
  /** ある段階のファイルだけを持つ。 */
  files: Partial<Record<Stage, StageFileInfo>>
  /** 段階ごとの着手済みか（ファイルがあって 1 バイト以上）。一覧の進み具合に使う。 */
  started: Record<Stage, boolean>
}

export interface StageContent {
  /** LF に正規化した本文。ファイルが無ければ空文字。 */
  text: string
  /** 保存のときに渡す版番号。ファイルが無ければ null（保存は `add` になる）。 */
  rev: string | null
  /** 保存のときに渡す、元のファイルの形式。 */
  format: StageTextFormat
}

export interface SaveBase {
  /** 読んだときの `rev`（無ければ null）。 */
  rev: string | null
  /** 読んだときの形式。 */
  format: StageTextFormat
}

export interface SavedStage {
  rev: string
  size: number
  serverModified: string
}

export interface ParagraphStore {
  listParagraphs(): Promise<ParagraphSummary[]>
  readStage(id: string, stage: Stage): Promise<StageContent>
  saveStage(id: string, stage: Stage, text: string, base: SaveBase): Promise<SavedStage>
  /** フォルダを作って id を返す。同名があれば `-2`, `-3` … を付ける。 */
  createParagraph(date: string, theme: string): Promise<string>
  /** フォルダごと消す（Dropbox の削除済みファイルから戻せる）。既に無ければ何もしない。 */
  deleteParagraph(id: string): Promise<void>
}

interface ListFolderEntry {
  '.tag': string
  name?: string
  path_lower?: string
  path_display?: string
  rev?: string
  size?: number
  server_modified?: string
}

interface ListFolderResult {
  entries: ListFolderEntry[]
  cursor: string
  has_more: boolean
}

function stageOfFileName(name: string): Stage | null {
  const lower = name.toLowerCase()
  return STAGES.find((stage) => STAGE_FILES[stage] === lower) ?? null
}

function assertId(id: string): void {
  if (!isParagraphId(id)) throw new InvalidParagraphIdError(`パラグラフの id が不正です: ${id}`)
}

function emptyStarted(): Record<Stage, boolean> {
  return { assignment: false, ideas: false, outline: false, draft: false }
}

/**
 * list_folder の結果（再帰）をパラグラフごとにまとめる。純関数（テスト用に公開）。
 * `base` は `<root>/paragraphs`。id の形でないフォルダ・段階以外のファイル・深い階層は無視する。
 */
export function summarizeEntries(base: string, entries: ListFolderEntry[]): ParagraphSummary[] {
  const prefix = `${base.toLowerCase()}/`
  const byId = new Map<string, ParagraphSummary>()

  const summaryOf = (id: string): ParagraphSummary | null => {
    const createdOn = dateOfParagraphId(id)
    if (createdOn === null) return null
    let summary = byId.get(id)
    if (summary === undefined) {
      summary = {
        id,
        createdOn,
        updatedAt: `${createdOn}T00:00:00Z`,
        files: {},
        started: emptyStarted(),
      }
      byId.set(id, summary)
    }
    return summary
  }

  for (const entry of entries) {
    const lower = entry.path_lower
    if (lower === undefined || !lower.startsWith(prefix)) continue
    // 大文字小文字はサーバの表示どおり（path_display）を使う。長さは path_lower と同じ
    const display = entry.path_display ?? lower
    const segments = display.slice(prefix.length).split('/')
    const id = segments[0]
    if (id === undefined || id === '') continue

    if (entry['.tag'] === 'folder' && segments.length === 1) {
      summaryOf(id)
    } else if (entry['.tag'] === 'file' && segments.length === 2) {
      const stage = stageOfFileName(segments[1] ?? '')
      if (stage === null) continue
      const summary = summaryOf(id)
      if (summary === null || entry.rev === undefined) continue
      const info: StageFileInfo = {
        rev: entry.rev,
        size: entry.size ?? 0,
        serverModified: entry.server_modified ?? '',
      }
      summary.files[stage] = info
      summary.started[stage] = info.size > 0
    }
  }

  for (const summary of byId.values()) {
    const times = Object.values(summary.files)
      .map((info) => info.serverModified)
      .filter((time) => time !== '')
    // ISO8601（UTC・同じ桁数）なので文字列の大小で比べられる
    const latest = times.sort().at(-1)
    if (latest !== undefined) summary.updatedAt = latest
  }

  return [...byId.values()].sort((a, b) =>
    a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
  )
}

export function createParagraphStore(client: DropboxClient, root: string): ParagraphStore {
  const base = `${root}/${PARAGRAPHS_DIR}`
  const folderPath = (id: string) => `${base}/${id}`
  const filePath = (id: string, stage: Stage) => `${base}/${id}/${STAGE_FILES[stage]}`

  async function listParagraphs(): Promise<ParagraphSummary[]> {
    const entries: ListFolderEntry[] = []
    let result: ListFolderResult
    try {
      result = await client.rpc<ListFolderResult>('/2/files/list_folder', {
        path: base,
        recursive: true,
        limit: LIST_LIMIT,
      })
    } catch (error) {
      // まだ 1 つも作っていなければ paragraphs/ が無い
      if (isNotFoundError(error)) return []
      throw error
    }
    entries.push(...result.entries)
    // 件数が少なくても has_more が付くことがある（daily-note の実測）。必ず最後まで辿る
    while (result.has_more) {
      result = await client.rpc<ListFolderResult>('/2/files/list_folder/continue', {
        cursor: result.cursor,
      })
      entries.push(...result.entries)
    }
    return summarizeEntries(base, entries)
  }

  async function readStage(id: string, stage: Stage): Promise<StageContent> {
    assertId(id)
    try {
      const file = await client.download(filePath(id, stage))
      const decoded = decodeStageText(file.bytes)
      return { text: decoded.text, rev: file.rev, format: decoded.format }
    } catch (error) {
      if (isNotFoundError(error)) return { text: '', rev: null, format: NEW_FILE_FORMAT }
      throw error
    }
  }

  async function saveStage(
    id: string,
    stage: Stage,
    text: string,
    saveBase: SaveBase,
  ): Promise<SavedStage> {
    assertId(id)
    const bytes = encodeStageText(text, saveBase.format)
    try {
      const meta = await client.upload(
        filePath(id, stage),
        bytes,
        saveBase.rev === null ? { tag: 'add' } : { tag: 'update', rev: saveBase.rev },
      )
      return { rev: meta.rev, size: meta.size, serverModified: meta.serverModified }
    } catch (error) {
      if (isConflictError(error)) throw new StageConflictError(id, stage)
      throw error
    }
  }

  async function createParagraph(date: string, theme: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const id = paragraphIdCandidate(date, theme, attempt)
      try {
        await client.createFolder(folderPath(id))
        return id
      } catch (error) {
        if (isConflictError(error)) continue
        throw error
      }
    }
    throw new Error(`フォルダ名が重複し続けて作れません（${date} / ${MAX_CREATE_ATTEMPTS} 回）`)
  }

  async function deleteParagraph(id: string): Promise<void> {
    assertId(id)
    try {
      await client.remove(folderPath(id))
    } catch (error) {
      if (isNotFoundError(error)) return
      throw error
    }
  }

  return { listParagraphs, readStage, saveStage, createParagraph, deleteParagraph }
}
