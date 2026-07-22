import { Router } from 'express';
import type { Request, Response } from 'express';
import * as repo from '../db/repo.js';
import { correctDraft } from '../llm/correct.js';

export const articlesRouter = Router();

function parseId(req: Request, res: Response): number | undefined {
  const id = Number.parseInt(req.params['id'] ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return undefined;
  }
  return id;
}

articlesRouter.get('/', (_req, res) => {
  res.json(repo.listArticles());
});

articlesRouter.post('/', (_req, res) => {
  res.status(201).json(repo.createArticle());
});

articlesRouter.get('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === undefined) return;
  const article = repo.getArticle(id);
  if (!article) return void res.status(404).json({ error: 'not found' });
  res.json(article);
});

articlesRouter.put('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === undefined) return;
  const { rules, draft } = (req.body ?? {}) as { rules?: unknown; draft?: unknown };
  const fields: { rules?: string; draft?: string } = {};
  if (typeof rules === 'string') fields.rules = rules;
  if (typeof draft === 'string') fields.draft = draft;
  const article = repo.updateArticle(id, fields);
  if (!article) return void res.status(404).json({ error: 'not found' });
  res.json(article);
});

articlesRouter.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === undefined) return;
  if (!repo.deleteArticle(id)) return void res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// 保存済みの rules + draft で添削を実行し corrected / advice を上書きして返す
articlesRouter.post('/:id/correct', async (req, res) => {
  const id = parseId(req, res);
  if (id === undefined) return;
  const article = repo.getArticle(id);
  if (!article) return void res.status(404).json({ error: 'not found' });
  if (article.draft.trim() === '') {
    return void res.status(400).json({ error: 'draft is empty' });
  }
  try {
    const result = await correctDraft(article.rules, article.draft);
    res.json(repo.saveCorrection(id, result.corrected, result.advice));
  } catch (err) {
    console.error('correction failed:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'correction failed' });
  }
});
