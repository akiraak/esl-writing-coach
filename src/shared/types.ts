/**
 * サーバとブラウザで共有する型と定数（Node にも DOM にも依存しない）。
 *
 * API の応答の形はここで決める。サーバ側は `src/paragraphs/store.ts`（SQLite）、ブラウザ側は `src/browser/api.ts` が使う。
 */

/**
 * 段階。2026-11-09 にアイデアの段階をなくし、最初からアウトラインを作るようにした
 * （`docs/plans/archive/ideas-outline.md`）。
 */
export const STAGES = ['assignment', 'outline', 'draft'] as const
export type Stage = (typeof STAGES)[number]

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value)
}

export interface ParagraphSummary {
  /** パラグラフの id（`作成日-テーマのスラッグ`。`src/paragraphs/naming.ts`）。 */
  id: string
  /** 作成日（id の先頭。`YYYY-MM-DD`）。 */
  createdOn: string
  /** 段階の最新の保存時刻（ISO8601）。1 つも保存していなければ作成時刻。 */
  updatedAt: string
  /** 段階ごとの着手済みか（1 文字以上ある）。一覧の進み具合に使う。 */
  started: Record<Stage, boolean>
}

/** 一覧の 1 件（`GET /api/paragraphs`）。 */
export interface ParagraphListItem extends ParagraphSummary {
  /** 課題のテーマ（課題の書式の `# ` 行）。無ければ空文字。 */
  theme: string
}

export interface StageContent {
  /** 本文（LF）。まだ無ければ空文字。 */
  text: string
  /** 保存のときに渡す版番号。まだ無ければ null（保存は「無いときだけ作る」になる）。 */
  rev: string | null
}

export interface SaveBase {
  /** 読んだときの `rev`（無ければ null）。 */
  rev: string | null
}

export interface SavedStage {
  rev: string
  /** 保存した時刻（ISO8601）。 */
  updatedAt: string
}

/** API がエラーのときに返す本文。 */
export interface ApiErrorBody {
  /** `conflict`（rev が合わない）・`bad_id` など。 */
  error: string
  message: string
}
