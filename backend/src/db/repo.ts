import { getDb } from './index.js';
import { seedDefaultArticle } from './seed.js';

export interface User {
  id: number;
  email: string;
  created_at: string;
  seeded_at: string | null;
}

export interface Article {
  id: number;
  user_id: number;
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

/** メールアドレスでユーザーを upsert する（Access で許可された人だけが到達する前提の自動プロビジョニング）。 */
export function getOrCreateUser(email: string): User {
  const db = getDb();
  db.prepare('INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').run(
    email,
    now(),
  );
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User;

  // ユーザーごとに 1 回だけサンプル記事を入れる（削除されても再シードはしない）
  if (user.seeded_at === null) {
    db.transaction(() => {
      seedDefaultArticle(db, user.id);
      db.prepare('UPDATE users SET seeded_at = ? WHERE id = ?').run(now(), user.id);
    })();
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User;
  }
  return user;
}

export function listArticles(userId: number): ArticleSummary[] {
  return getDb()
    .prepare(
      'SELECT id, substr(draft, 1, 100) AS excerpt, updated_at, corrected_at FROM articles WHERE user_id = ? ORDER BY updated_at DESC',
    )
    .all(userId) as ArticleSummary[];
}

export function getArticle(userId: number, id: number): Article | undefined {
  return getDb()
    .prepare('SELECT * FROM articles WHERE id = ? AND user_id = ?')
    .get(id, userId) as Article | undefined;
}

export function createArticle(userId: number): Article {
  const ts = now();
  const result = getDb()
    .prepare('INSERT INTO articles (user_id, created_at, updated_at) VALUES (?, ?, ?)')
    .run(userId, ts, ts);
  return getArticle(userId, Number(result.lastInsertRowid))!;
}

export function updateArticle(
  userId: number,
  id: number,
  fields: { rules?: string; draft?: string },
): Article | undefined {
  const existing = getArticle(userId, id);
  if (!existing) return undefined;
  getDb()
    .prepare('UPDATE articles SET rules = ?, draft = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(fields.rules ?? existing.rules, fields.draft ?? existing.draft, now(), id, userId);
  return getArticle(userId, id);
}

/** 添削結果（最新のみ保持）を上書きする。updated_at は変えない: 保存操作とは別物のため。 */
export function saveCorrection(
  userId: number,
  id: number,
  corrected: string,
  advice: string,
): Article | undefined {
  const existing = getArticle(userId, id);
  if (!existing) return undefined;
  getDb()
    .prepare(
      'UPDATE articles SET corrected = ?, advice = ?, corrected_at = ? WHERE id = ? AND user_id = ?',
    )
    .run(corrected, advice, now(), id, userId);
  return getArticle(userId, id);
}

export function deleteArticle(userId: number, id: number): boolean {
  return (
    getDb().prepare('DELETE FROM articles WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  );
}
