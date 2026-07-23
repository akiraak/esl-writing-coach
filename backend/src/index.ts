import express from 'express';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { createAuthMiddleware } from './auth.js';
import { articlesRouter } from './routes/articles.js';

getDb(); // 起動時に DB ファイル作成 + スキーマ適用

const app = express();
app.use(express.json({ limit: '1mb' }));
// 本番でのエラー調査用に、失敗レスポンスだけ記録する
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    }
  });
  next();
});
// 認証は静的配信も含めて一律にかける（HTML 自体は Access が守るが、考えることを減らす）
app.use(createAuthMiddleware());
app.use(express.static(config.publicDir));
app.use('/api/articles', articlesRouter);

// ログイン中ユーザーの情報。logoutUrl は Cloudflare 経由時のみ機能するため DEV では null
app.get('/api/me', (_req, res) => {
  res.json({
    email: res.locals['userEmail'],
    logoutUrl: config.auth.mode === 'cloudflare' ? '/cdn-cgi/access/logout' : null,
  });
});

app.listen(config.port, () => {
  console.log(`esl-writing-coach: http://localhost:${config.port} (auth: ${config.auth.mode})`);
});
