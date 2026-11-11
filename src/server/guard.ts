/**
 * リクエストの安全チェック（project-manager の `app/src/guard.ts` にならう）。
 *
 * サーバは 127.0.0.1 で待ち受けるが、利用者のブラウザで開いた別のサイトからも
 * `http://127.0.0.1:3016/api/...` にリクエストは送れてしまう。このアプリは認証を付けずに
 * データ（DB）へ書き込むので、次を守る。
 *
 * - **Host** が `127.0.0.1` / `localhost` / `esl-writing.localhost`（とこのポート）のときだけ受ける（DNS rebinding 対策）
 * - **Origin** が付いていれば、同じ名前・ポートのときだけ受ける
 * - 書き込み（GET / HEAD 以外）は **`X-ESL-Request: 1` と `Content-Type: application/json`** を必須にする。
 *   別のオリジンのページは事前確認（CORS preflight）なしにこのヘッダを付けられず、こちらは CORS を許さないので送れない
 */

/**
 * アプリを開ける名前（Host のポートの前の部分）。`esl-writing.localhost` は覚えやすい名前で開くため。
 * `*.localhost` はブラウザが DNS を引かずに自分の PC に向けるので、外のサイトがこの名前を
 * 自分のサーバに向けることはできず、DNS rebinding への備えは保てる。
 */
export const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', 'esl-writing.localhost'] as const

/** 画面で案内する開き方。 */
export const FRIENDLY_NAME = 'esl-writing.localhost'

/** 書き込みに必須のヘッダ（ブラウザ側の `src/browser/api.ts` が付ける）。 */
export const REQUEST_HEADER = 'x-esl-request'

export function allowedHosts(port: number): Set<string> {
  return new Set(LOOPBACK_NAMES.map((name) => `${name}:${port}`))
}

export interface GuardInput {
  method: string
  host: string | undefined
  origin: string | undefined
  contentType: string | undefined
  requestHeader: string | undefined
}

export interface GuardRejection {
  status: 403
  error: string
}

/** 通してよければ null、断るなら理由。 */
export function checkRequest(input: GuardInput, port: number): GuardRejection | null {
  const hosts = allowedHosts(port)
  if (input.host === undefined || !hosts.has(input.host.toLowerCase())) {
    return { status: 403, error: 'Host が許可されていません' }
  }
  if (input.origin !== undefined) {
    const m = /^http:\/\/([^/]+)$/.exec(input.origin.toLowerCase())
    if (m === null || !hosts.has(m[1] ?? '')) {
      return { status: 403, error: 'Origin が許可されていません' }
    }
  }
  if (input.method !== 'GET' && input.method !== 'HEAD') {
    const json = (input.contentType ?? '').toLowerCase().startsWith('application/json')
    if (input.requestHeader !== '1' || !json) {
      return { status: 403, error: '書き込みには X-ESL-Request: 1 と JSON が必要です' }
    }
  }
  return null
}

/** 画面の応答に付ける CSP。スクリプト・スタイルは自分のオリジンのファイルだけ（インラインは使わない）。 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')
