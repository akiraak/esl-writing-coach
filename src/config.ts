/**
 * 環境変数の読み込み。
 *
 * ローカル専用・認証なし（`CLAUDE.md`）なので、サーバは常に 127.0.0.1 だけで待ち受ける。
 * 公開用の設定（daily-note の Cloudflare Access など）は持たない。
 */

/** 設定が不正なときに投げる。呼び出し側はメッセージを出して終了する。 */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

type Env = Record<string, string | undefined>

/** project-manager の `projects.yaml` に書いてあるポート（daily-note の 3013 と重ならない）。 */
export const DEFAULT_PORT = 3016

/** 待ち受けるアドレス。認証を付けないので、ループバックの外には開かない。 */
export const BIND_HOST = '127.0.0.1'

/** Dropbox のバックアップ先（`CLAUDE.md` の「データ保存」。daily-note の日誌フォルダの隣）。 */
export const DEFAULT_DROPBOX_ROOT = '/akira/Documents/esl-writing'

/** 値を読んで前後の空白を落とす。空文字と未設定は同じ「未設定」として扱う。 */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

export function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT が不正です: ${raw}（1〜65535 の整数）`)
  }
  return port
}

/**
 * DB のファイル（`ESL_DB_PATH`。無ければ `defaultPath`）。相対パスは `baseDir` から。
 * Dropbox で同期しているフォルダには置かない（同期中に書くと壊れることがある）。
 */
export function loadDbPath(env: Env, baseDir: string, defaultPath: string): string {
  const raw = read(env, 'ESL_DB_PATH')
  if (raw === undefined) return defaultPath
  return raw === ':memory:' || raw.startsWith('/') ? raw : `${baseDir.replace(/\/+$/, '')}/${raw}`
}

export interface DropboxSettings {
  appKey: string
  appSecret: string
  /** daily-note と共用の refresh token（取り直すのは daily-note の `npm run dropbox:auth`）。 */
  refreshToken: string
  /** バックアップを置くフォルダの親（Dropbox ルートからのパス。末尾に `/` を付けない）。 */
  root: string
}

function parseRoot(raw: string | undefined): string {
  const root = raw ?? DEFAULT_DROPBOX_ROOT
  if (!root.startsWith('/')) {
    throw new ConfigError(`DROPBOX_ROOT は / で始まるパスにしてください: ${root}`)
  }
  // Dropbox API はフォルダの末尾 `/` を受け付けない
  const trimmed = root.replace(/\/+$/, '')
  if (trimmed === '') {
    // Dropbox のルートそのものに paragraphs/ を作らせない（ほかのファイルと混ざる）
    throw new ConfigError('DROPBOX_ROOT に Dropbox のルート（/）は指定できません')
  }
  return trimmed
}

/** Dropbox にアクセスするための設定一式を読む。足りなければ `ConfigError`。 */
export function loadDropboxConfig(env: Env = process.env): DropboxSettings {
  const names = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'] as const
  const missing = names.filter((name) => read(env, name) === undefined)
  if (missing.length > 0) {
    throw new ConfigError(
      `Dropbox の設定が足りません: ${missing.join(' / ')}\n` +
        '（daily-note の .env の同じ名前の値を、このリポジトリの .env に写してください）',
    )
  }
  return {
    appKey: read(env, 'DROPBOX_APP_KEY') as string,
    appSecret: read(env, 'DROPBOX_APP_SECRET') as string,
    refreshToken: read(env, 'DROPBOX_REFRESH_TOKEN') as string,
    root: parseRoot(read(env, 'DROPBOX_ROOT')),
  }
}

export interface AiSettings {
  apiKey: string
}

/**
 * AI の採点の設定（`ANTHROPIC_API_KEY`）。無ければ null（AI の機能だけが使えず、ほかは動く）。
 * キーはログで伏せるよう呼び出し側で `registerSecret` する。
 */
export function loadAiConfig(env: Env = process.env): AiSettings | null {
  const apiKey = read(env, 'ANTHROPIC_API_KEY')
  return apiKey === undefined ? null : { apiKey }
}
