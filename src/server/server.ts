import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import type { Ai } from '../ai/client.js'
import { describeError, log } from '../log.js'
import type { ParagraphStore } from '../paragraphs/store.js'
import { handleApi, sendJson } from './api.js'
import { CONTENT_SECURITY_POLICY, checkRequest, REQUEST_HEADER } from './guard.js'

/**
 * HTTP サーバ。安全チェック（`guard.ts`）→ `/api/` は JSON の API、ほかは画面のファイル。
 *
 * 画面は 1 ページ（`web/index.html`）だけで、一覧・編集・学習ガイドの切り替えは URL のハッシュで行う
 * （`src/shared/route.ts`）。なのでサーバが返すページは `/` だけ。
 */

export interface AppOptions {
  port: number
  store: ParagraphStore
  /** `web/`（index.html・style.css）の場所。 */
  webDir: string
  /** esbuild の出力（app.js）の場所。 */
  bundleDir: string
  today?: () => string
  /** AI（採点・アイデア出し。`ANTHROPIC_API_KEY` が無ければ null）。 */
  ai?: Ai | null
  now?: () => string
}

/** 配るファイル（URL のパス → どこの何か）。これ以外は 404。 */
function staticFile(pathname: string, options: AppOptions): { file: string; type: string } | null {
  switch (pathname) {
    case '/':
    case '/index.html':
      return { file: path.join(options.webDir, 'index.html'), type: 'text/html; charset=utf-8' }
    case '/style.css':
      return { file: path.join(options.webDir, 'style.css'), type: 'text/css; charset=utf-8' }
    case '/app.js':
      return {
        file: path.join(options.bundleDir, 'app.js'),
        type: 'text/javascript; charset=utf-8',
      }
    default:
      return null
  }
}

async function serveStatic(
  res: ServerResponse,
  method: string,
  pathname: string,
  options: AppOptions,
): Promise<void> {
  const target = staticFile(pathname, options)
  if (target === null || (method !== 'GET' && method !== 'HEAD')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
    return
  }
  let body: Buffer
  try {
    body = await readFile(target.file)
  } catch (error) {
    log.error(
      `画面のファイルを読めません（npm run build は済んでいますか）: ${describeError(error)}`,
    )
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('build が必要です')
    return
  }
  res.writeHead(200, {
    'content-type': target.type,
    // 自分専用・ローカルなので、作り直したらすぐ反映されるよう毎回取り直させる
    'cache-control': 'no-store',
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(method === 'HEAD' ? undefined : body)
}

export function createAppHandler(options: AppOptions) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET'
    const rejection = checkRequest(
      {
        method,
        host: req.headers.host,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        requestHeader: req.headers[REQUEST_HEADER] as string | undefined,
      },
      options.port,
    )
    if (rejection !== null) {
      sendJson(res, rejection.status, { error: 'forbidden', message: rejection.error })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const done = pathname.startsWith('/api/')
      ? handleApi(req, res, pathname, options)
      : serveStatic(res, method, pathname, options)
    done.catch((error: unknown) => {
      log.error(`${method} ${pathname}: ${describeError(error)}`)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal', message: '内部エラー' })
      else res.end()
    })
  }
}

/** `host` で待ち受けて、待ち受けられたら Server を返す。 */
export function listen(handler: ReturnType<typeof createAppHandler>, port: number, host: string) {
  return new Promise<Server>((resolve, reject) => {
    const server = createServer(handler)
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}
