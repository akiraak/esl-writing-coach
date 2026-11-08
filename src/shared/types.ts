/**
 * サーバとブラウザで共有する型と定数（Node にも DOM にも依存しない）。
 *
 * API の応答の形はここで決める。サーバ側は `src/paragraphs/store.ts`、ブラウザ側は `src/browser/api.ts` が使う。
 */

export const STAGES = ['assignment', 'ideas', 'outline', 'draft'] as const
export type Stage = (typeof STAGES)[number]

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value)
}

export const STAGE_FILES: Readonly<Record<Stage, string>> = {
  assignment: 'assignment.md',
  ideas: 'ideas.txt',
  outline: 'outline.txt',
  draft: 'draft.txt',
}

export type Eol = 'lf' | 'crlf'

/** 段階のファイルの元の形式。読み込み時に控え、保存時にそのまま返す。 */
export interface StageTextFormat {
  /** 元の改行コード。CRLF を 1 つでも含めば 'crlf'。 */
  eol: Eol
  /** 先頭に BOM があったか。 */
  bom: boolean
  /** 末尾に改行があったか。 */
  finalNewline: boolean
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

/** 一覧の 1 件（`GET /api/paragraphs`）。 */
export interface ParagraphListItem extends ParagraphSummary {
  /** `assignment.md` のテーマ。無い・読めなければ空文字。 */
  theme: string
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

/** API がエラーのときに返す本文。 */
export interface ApiErrorBody {
  /** `conflict`（rev が合わない）・`bad_id` など。 */
  error: string
  message: string
}
