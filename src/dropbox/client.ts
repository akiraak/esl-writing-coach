import type { DropboxSettings } from '../config.js'
import { mask, registerSecret } from '../log.js'

/**
 * Dropbox API のクライアント（トークン自動更新つき）。daily-note の `src/dropbox/client.ts` から移植。
 *
 * SDK は使わず `fetch` で REST を直接叩く。daily-note との違い: `move` を落とし、
 * フォルダの作成（`createFolder`）と、`rev` を付けない削除（フォルダ用）を足した。
 *
 * - アクセストークンは**メモリだけ**に持つ（約 4 時間で失効）。期限の少し前になったら
 *   refresh token で取り直す。ディスクには書かない
 * - それでも 401 が返ったら（時計ずれ・トークン失効）**1 回だけ**取り直して再送する
 * - **本文とトークンをログ・例外に載せない**。エラーは Dropbox が返す
 *   `error_summary`（`path/not_found/...` のようなタグ）と HTTP ステータスまでにする
 */

const TOKEN_URL = 'https://api.dropbox.com/oauth2/token'
const RPC_BASE = 'https://api.dropboxapi.com'
/** ファイルの中身をやり取りするエンドポイントは別ホスト。 */
const CONTENT_BASE = 'https://content.dropboxapi.com'

/** 期限のどれだけ前に取り直すか。 */
const REFRESH_MARGIN_MS = 5 * 60_000

/** `expires_in` が返らなかったときの寿命（Dropbox の既定は 4 時間）。 */
const DEFAULT_EXPIRES_IN_SECONDS = 4 * 60 * 60

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** トークンの取得・更新に失敗した（設定が誤っている / 認可が取り消された）。 */
export class DropboxAuthError extends Error {
  override name = 'DropboxAuthError'
}

/** API がエラーを返した。`errorSummary` で分岐する（`path/conflict` など）。 */
export class DropboxApiError extends Error {
  override name = 'DropboxApiError'
  readonly status: number
  readonly errorSummary: string

  constructor(status: number, errorSummary: string) {
    super(`Dropbox API エラー（HTTP ${status}）: ${errorSummary}`)
    this.status = status
    this.errorSummary = errorSummary
  }
}

/** 応答が想定と違う（メタデータが欠けている等）。 */
export class DropboxResponseError extends Error {
  override name = 'DropboxResponseError'
}

/** ファイルのメタデータ（download / upload が返すもののうち、使う分だけ）。 */
export interface DropboxFileMetadata {
  /** 版番号。保存時にこれを渡して競合を検出する。 */
  rev: string
  /** Dropbox 上の実パス（大文字小文字はサーバの持つとおり）。 */
  path: string
  /** サーバ側の更新時刻（ISO8601。読めなければ空文字）。 */
  serverModified: string
  /** バイト数。 */
  size: number
}

/** `/2/files/download` の結果。中身はバイト列のまま返す（文字コードの解釈はしない）。 */
export interface DropboxFile extends DropboxFileMetadata {
  bytes: Buffer
}

/**
 * 書き込みの仕方。**`overwrite` は用意しない**（他端末の更新を消さないため）。
 *
 * - `add`: 新規作成。既にあれば競合（`autorename` もしない）
 * - `update`: 取得時の `rev` と一致するときだけ書き換える
 */
export type UploadMode = { tag: 'add' } | { tag: 'update'; rev: string }

export interface DropboxClient {
  /** RPC エンドポイントを叩く（`/2/files/list_folder` など）。 */
  rpc<T>(endpoint: string, body?: unknown): Promise<T>
  /** ファイルの中身を取る（`/2/files/download`）。 */
  download(path: string): Promise<DropboxFile>
  /** ファイルを書く（`/2/files/upload`）。競合は `DropboxApiError`（409）で返る。 */
  upload(path: string, bytes: Uint8Array, mode: UploadMode): Promise<DropboxFileMetadata>
  /**
   * フォルダを作る（`/2/files/create_folder_v2`）。**`autorename` はしない**。
   * 既にあれば `DropboxApiError`（409 `path/conflict/...`。`isConflictError` で判定できる）。
   * 作ったフォルダの実パスを返す。
   */
  createFolder(path: string): Promise<string>
  /**
   * ファイル・フォルダを消す（`/2/files/delete_v2`）。フォルダは中身ごと消える。
   * `rev` を渡すと `parent_rev` に付けるので、他で更新されて rev が変わっていれば Dropbox が断る（409。ファイルだけ）。
   * 無ければ 409 の `path_lookup/not_found`（`isNotFoundError`）。消したものは Dropbox の削除済みファイルから戻せる。
   */
  remove(path: string, rev?: string): Promise<void>
  /** 有効なアクセストークンを返す（content エンドポイント用。失効していれば取り直す）。 */
  accessToken(): Promise<string>
}

/**
 * 「他が先に書いている」エラーか。
 *
 * - `update` + `rev` 不一致 → 他端末が先に更新している
 * - `add` + 同名あり → 既にそのファイルがある
 * - `createFolder` + 同名あり → 既にそのフォルダがある
 *
 * どちらも Dropbox は 409 の `path/conflict/...` で返す。**上書きはしない**ので、
 * 呼び出し側は使ったモードで意味を読み分ける。
 */
export function isConflictError(error: unknown): boolean {
  return (
    error instanceof DropboxApiError &&
    error.status === 409 &&
    error.errorSummary.startsWith('path/conflict')
  )
}

/** そのパスに何も無い（`path_lookup/not_found`。消そうとしたら既に無かった、など）。 */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof DropboxApiError &&
    error.status === 409 &&
    /^path(_lookup)?\/not_found/.test(error.errorSummary)
  )
}

export interface DropboxClientOptions {
  /** 差し替えられるのはテストのため。 */
  fetch?: FetchLike
  now?: () => number
}

function basicAuth(appKey: string, appSecret: string): string {
  return `Basic ${Buffer.from(`${appKey}:${appSecret}`, 'utf8').toString('base64')}`
}

/**
 * `Dropbox-API-Arg` ヘッダの値を作る。
 *
 * 引数を HTTP ヘッダに載せる方式なので **ASCII しか置けない**。パスに日本語が入っても
 * 壊れないよう、非 ASCII は JSON の `\uXXXX` に逃がす（制御文字は JSON.stringify が先に逃がしている）。
 */
export function apiArgHeader(arg: unknown): string {
  const json = JSON.stringify(arg)
  let escaped = ''
  for (let index = 0; index < json.length; index += 1) {
    const unit = json.charCodeAt(index)
    escaped += unit < 0x7f ? json[index] : `\\u${unit.toString(16).padStart(4, '0')}`
  }
  return escaped
}

/** エラー応答の本文を安全な 1 行にする。JSON なら `error_summary` を優先して取り出す。 */
async function describeErrorBody(response: Response): Promise<string> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return '(本文を読めません)'
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const summary = (parsed as { error_summary?: unknown }).error_summary
      if (typeof summary === 'string') return mask(summary)
      const description = (parsed as { error_description?: unknown }).error_description
      if (typeof description === 'string') return mask(description)
    }
  } catch {
    // JSON でなければ本文をそのまま（長さは切る）
  }
  return mask(text.slice(0, 200))
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/**
 * ファイルのメタデータを読む（download は応答ヘッダ、upload は応答本文に入っている）。
 * **`rev` が無ければ諦める**（無いまま編集させると、保存時に競合を検出できない）。
 */
function parseFileMetadata(source: unknown, where: string): DropboxFileMetadata {
  if (typeof source !== 'object' || source === null) {
    throw new DropboxResponseError(`Dropbox の応答（${where}）を解釈できません`)
  }
  const meta = source as Record<string, unknown>
  const rev = readString(meta, 'rev')
  if (rev === '') throw new DropboxResponseError(`Dropbox の応答（${where}）に rev がありません`)
  const pathDisplay = readString(meta, 'path_display')
  const size = meta['size']
  return {
    rev,
    path: pathDisplay === '' ? readString(meta, 'path_lower') : pathDisplay,
    serverModified: readString(meta, 'server_modified'),
    size: typeof size === 'number' ? size : 0,
  }
}

/** download の `Dropbox-API-Result` ヘッダを読む。 */
function parseResultHeader(header: string | null): DropboxFileMetadata {
  if (header === null) {
    throw new DropboxResponseError('Dropbox の応答に Dropbox-API-Result がありません')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(header)
  } catch {
    throw new DropboxResponseError('Dropbox-API-Result を解釈できません')
  }
  return parseFileMetadata(parsed, 'Dropbox-API-Result')
}

export function createDropboxClient(
  settings: DropboxSettings,
  options: DropboxClientOptions = {},
): DropboxClient {
  const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))
  const now = options.now ?? Date.now

  // 万一ログに流れても伏せられるようにしておく
  registerSecret(settings.appSecret)
  registerSecret(settings.refreshToken)

  let token: string | null = null
  let expiresAtMs = 0

  async function refresh(): Promise<string> {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: basicAuth(settings.appKey, settings.appSecret),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: settings.refreshToken,
      }).toString(),
    })
    if (!response.ok) {
      throw new DropboxAuthError(
        `アクセストークンを更新できません（HTTP ${response.status}）: ` +
          `${await describeErrorBody(response)}`,
      )
    }
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token === '') {
      throw new DropboxAuthError('アクセストークンの応答に access_token がありません')
    }
    registerSecret(body.access_token)
    token = body.access_token
    const expiresIn =
      typeof body.expires_in === 'number' ? body.expires_in : DEFAULT_EXPIRES_IN_SECONDS
    expiresAtMs = now() + expiresIn * 1000
    return token
  }

  async function accessToken(): Promise<string> {
    if (token !== null && now() < expiresAtMs - REFRESH_MARGIN_MS) return token
    return refresh()
  }

  /** 401 は 1 回だけトークンを取り直して再送する（時計ずれ・想定外の失効）。 */
  async function send(url: string, build: (bearer: string) => RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      const bearer = await accessToken()
      const response = await fetchImpl(url, build(bearer))
      if (response.status === 401 && attempt === 0) {
        token = null
        continue
      }
      if (!response.ok) {
        throw new DropboxApiError(response.status, await describeErrorBody(response))
      }
      return response
    }
  }

  async function rpc<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await send(`${RPC_BASE}${endpoint}`, (bearer) => ({
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
    return (await response.json()) as T
  }

  async function download(path: string): Promise<DropboxFile> {
    const response = await send(`${CONTENT_BASE}/2/files/download`, (bearer) => ({
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'dropbox-api-arg': apiArgHeader({ path }),
      },
    }))
    const metadata = parseResultHeader(response.headers.get('dropbox-api-result'))
    return { ...metadata, bytes: Buffer.from(await response.arrayBuffer()) }
  }

  async function upload(
    path: string,
    bytes: Uint8Array,
    mode: UploadMode,
  ): Promise<DropboxFileMetadata> {
    const arg = {
      path,
      mode: mode.tag === 'add' ? 'add' : { '.tag': 'update', update: mode.rev },
      autorename: false,
      // rev が違えば必ず競合にする（中身がたまたま同じでも黙って書かない）
      strict_conflict: true,
    }
    const response = await send(`${CONTENT_BASE}/2/files/upload`, (bearer) => ({
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'dropbox-api-arg': apiArgHeader(arg),
        'content-type': 'application/octet-stream',
      },
      body: bytes,
    }))
    return parseFileMetadata(await response.json(), 'upload')
  }

  async function createFolder(path: string): Promise<string> {
    const result = await rpc<{ metadata?: { path_display?: unknown; path_lower?: unknown } }>(
      '/2/files/create_folder_v2',
      { path, autorename: false },
    )
    const display = result.metadata?.path_display
    if (typeof display === 'string' && display !== '') return display
    const lower = result.metadata?.path_lower
    if (typeof lower === 'string' && lower !== '') return lower
    throw new DropboxResponseError('Dropbox の応答（create_folder_v2）にパスがありません')
  }

  async function remove(path: string, rev?: string): Promise<void> {
    await rpc('/2/files/delete_v2', rev === undefined ? { path } : { path, parent_rev: rev })
  }

  return { rpc, download, upload, createFolder, remove, accessToken }
}
