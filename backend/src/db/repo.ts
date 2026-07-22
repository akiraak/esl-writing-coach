import { getDb } from './index.js';

export interface Article {
  id: number;
  rules: string;
  draft: string;
  corrected: string;
  advice: string;
  created_at: string;
  updated_at: string;
  corrected_at: string | null;
}

export interface ArticleSummary {
  id: number;
  excerpt: string; // draft の冒頭（一覧表示用）
  updated_at: string;
  corrected_at: string | null;
}

function now(): string {
  return new Date().toISOString();
}

export function listArticles(): ArticleSummary[] {
  return getDb()
    .prepare(
      'SELECT id, substr(draft, 1, 100) AS excerpt, updated_at, corrected_at FROM articles ORDER BY updated_at DESC',
    )
    .all() as ArticleSummary[];
}

export function getArticle(id: number): Article | undefined {
  return getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | undefined;
}

export function createArticle(): Article {
  const ts = now();
  const result = getDb()
    .prepare('INSERT INTO articles (created_at, updated_at) VALUES (?, ?)')
    .run(ts, ts);
  return getArticle(Number(result.lastInsertRowid))!;
}

export function updateArticle(
  id: number,
  fields: { rules?: string; draft?: string },
): Article | undefined {
  const existing = getArticle(id);
  if (!existing) return undefined;
  getDb()
    .prepare('UPDATE articles SET rules = ?, draft = ?, updated_at = ? WHERE id = ?')
    .run(fields.rules ?? existing.rules, fields.draft ?? existing.draft, now(), id);
  return getArticle(id);
}

/** 添削結果（最新のみ保持）を上書きする。updated_at は変えない: 保存操作とは別物のため。 */
export function saveCorrection(id: number, corrected: string, advice: string): Article | undefined {
  const existing = getArticle(id);
  if (!existing) return undefined;
  getDb()
    .prepare('UPDATE articles SET corrected = ?, advice = ?, corrected_at = ? WHERE id = ?')
    .run(corrected, advice, now(), id);
  return getArticle(id);
}

export function deleteArticle(id: number): boolean {
  return getDb().prepare('DELETE FROM articles WHERE id = ?').run(id).changes > 0;
}
