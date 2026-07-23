import type Database from 'better-sqlite3';

/**
 * ユーザーごとに 1 回だけ入れるサンプル記事。
 * ESL の最初の課題「自己紹介の提出」という体で、ルール欄（英語の課題文）の使い方と、
 * 書きかけの本文に日本語メモを混ぜてよいことが伝わる内容にする。
 */
export const SEED_RULES = `Assignment 1: Self-Introduction

Write a short self-introduction essay of about 100 words.

How to write a self-introduction:
1. Start with a greeting and your name.
2. Say where you live or where you are from.
3. Describe your job or what you study.
4. Share a hobby or something you enjoy.
5. End with why you are learning English and a closing sentence.

Example sentences:
- Hi, my name is Kenji, and I live in Osaka.
- I work as a sales manager at a food company.
- In my free time, I enjoy hiking and taking photos.
- I am learning English because I want to travel abroad on my own.

Your essay must include:
- Your name and where you live
- Your job or studies
- At least one hobby or interest
- Your goal for learning English`;

export const SEED_DRAFT = `Hello, everyone. My name is Taro, and I live in Tokyo.
I work at a software company as a project manager.
趣味の段落はまだ迷い中。キャンプが好きで月に 1 回は山に行っていること、焚き火を見ながらコーヒーを飲む時間が最高、ということを書きたい。
英語を学ぶ理由は「海外のチームメンバーと通訳なしで話したいから」にする予定。最後は「これからよろしくお願いします」のような締めの一文で終わりたい。`;

// 添削結果も初回から見えるよう事前に入れておく。中身は SEED_RULES / SEED_DRAFT を
// 実際の添削 API（correctDraft）に通した本物の出力（シード時に LLM は呼ばない）
export const SEED_CORRECTED = `Hello, everyone. My name is Taro, and I live in Tokyo. I work at a software company as a project manager. In my free time, I enjoy camping, and I go to the mountains about once a month. My favorite moment is sitting by the campfire and drinking coffee while watching the flames. I am learning English because I want to talk with my overseas team members without an interpreter. Thank you, and I look forward to learning with all of you.`;

export const SEED_ADVICE = `・「趣味の段落」以降が日本語のままだったので、英語に翻訳して自然な文章に整えました。特に「焚き火を見ながらコーヒーを飲む時間が最高」は "My favorite moment is sitting by the campfire and drinking coffee while watching the flames." のように、具体的な情景が伝わる表現にしています。
・「月に1回は山に行っている」は "I go to the mountains about once a month." と表現し、頻度を明確にしました。
・英語を学ぶ理由の部分は "I am learning English because I want to talk with my overseas team members without an interpreter." とし、rulesの例文 "I am learning English because I want to..." の形に沿わせています。
・締めの一文「これからよろしくお願いします」は英語に直訳しにくい表現なので、"Thank you, and I look forward to learning with all of you." のように自己紹介の締めくくりとして自然な英語表現に置き換えました。
・全体を通して、100語程度という指定に収まるよう簡潔にまとめています。`;

/** サンプル記事を 1 件 INSERT する。添削結果も含めて最初から埋まった状態にする。 */
export function seedDefaultArticle(db: Database.Database, userId: number): void {
  const ts = new Date().toISOString();
  // 既に記事を持つユーザーには一覧（updated_at DESC）の末尾に並ぶよう、最古の記事より古い日時を付ける
  const { m } = db
    .prepare('SELECT MIN(updated_at) AS m FROM articles WHERE user_id = ?')
    .get(userId) as { m: string | null };
  const oldest = m ? Date.parse(m) : Number.NaN;
  const updatedAt = Number.isNaN(oldest) ? ts : new Date(oldest - 1000).toISOString();
  db.prepare(
    'INSERT INTO articles (user_id, rules, draft, corrected, advice, created_at, updated_at, corrected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, SEED_RULES, SEED_DRAFT, SEED_CORRECTED, SEED_ADVICE, ts, updatedAt, updatedAt);
}
