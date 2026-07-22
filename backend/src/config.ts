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

export const config = {
  port: Number.parseInt(withDefault('PORT', '3013'), 10),
  db: {
    path: path.join(BACKEND_ROOT, 'data', 'esl-writing-coach.db'),
  },
  llm: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    model: withDefault('LLM_MODEL', 'claude-opus-4-8'),
  },
  publicDir: path.join(BACKEND_ROOT, 'public'),
};
