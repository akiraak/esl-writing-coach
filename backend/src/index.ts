import express from 'express';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { articlesRouter } from './routes/articles.js';

getDb(); // 起動時に DB ファイル作成 + スキーマ適用

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(config.publicDir));
app.use('/api/articles', articlesRouter);

app.listen(config.port, () => {
  console.log(`esl-writing-coach: http://localhost:${config.port}`);
});
