import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';

/**
 * Cloudflare Access の JWT（Cf-Access-Jwt-Assertion ヘッダ）を検証し、
 * メールアドレスを res.locals.userEmail に載せる。
 *
 * Cloudflare を素通りしてローカルポートへ直接アクセスされるケースに備え、
 * ヘッダの存在だけでは信用せず署名を必ず検証する。DEV フォールバック時は
 * 全リクエストを DEV_USER_EMAIL のユーザーとして扱う。
 */
export function createAuthMiddleware(): RequestHandler {
  if (config.auth.mode === 'dev') {
    const email = config.auth.devUserEmail;
    return (_req, res, next) => {
      res.locals['userEmail'] = email;
      next();
    };
  }

  const { teamDomain, aud } = config.auth;
  // JWKS のキャッシュとキーローテーションは jose が面倒を見る
  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

  return async (req, res, next) => {
    const token = req.header('Cf-Access-Jwt-Assertion');
    if (!token) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: teamDomain, audience: aud });
      const email = payload['email'];
      if (typeof email !== 'string' || email === '') {
        return void res.status(401).json({ error: 'unauthorized' });
      }
      res.locals['userEmail'] = email;
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}
