import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/ ルート（src/ の 1 つ上）
export const BACKEND_ROOT = path.resolve(__dirname, '..');

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function withDefault(name: string, fallback: string): string {
  return optional(name) ?? fallback;
}

/**
 * 認証設定。Cloudflare Access の 2 変数が揃っていれば JWT 検証モード、
 * 無ければ DEV_USER_EMAIL による開発用フォールバック。どちらも無ければ
 * 認証なしで公開してしまうのを防ぐため起動時エラーにする。
 */
function resolveAuth():
  | { mode: 'cloudflare'; teamDomain: string; aud: string }
  | { mode: 'dev'; devUserEmail: string } {
  const teamDomain = optional('CF_ACCESS_TEAM_DOMAIN');
  const aud = optional('CF_ACCESS_AUD');
  if (teamDomain && aud) {
    return { mode: 'cloudflare', teamDomain: teamDomain.replace(/\/+$/, ''), aud };
  }
  if (teamDomain || aud) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN と CF_ACCESS_AUD は両方セットで指定してください');
  }
  const devUserEmail = optional('DEV_USER_EMAIL');
  if (!devUserEmail) {
    throw new Error(
      '認証設定がありません。CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD（Cloudflare Access）か、' +
        'DEV_USER_EMAIL（ローカル開発用）を .env に設定してください',
    );
  }
  return { mode: 'dev', devUserEmail };
}

export const config = {
  port: Number.parseInt(withDefault('PORT', '3013'), 10),
  db: {
    path: path.join(BACKEND_ROOT, 'data', 'esl-writing-coach.db'),
  },
  llm: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    model: withDefault('LLM_MODEL', 'claude-sonnet-5'),
  },
  auth: resolveAuth(),
  // user_id 追いつきマイグレーションで既存記事を割り当てるユーザー。移行後は不要
  ownerEmail: optional('OWNER_EMAIL'),
  publicDir: path.join(BACKEND_ROOT, 'public'),
};
