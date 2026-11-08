import type { Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BIND_HOST, ConfigError, loadDropboxConfig, parsePort } from './config.js'
import { createDropboxClient } from './dropbox/client.js'
import { describeError, log } from './log.js'
import { createParagraphStore } from './paragraphs/store.js'
import { FRIENDLY_NAME } from './server/guard.js'
import { createAppHandler, listen } from './server/server.js'

/**
 * 起動（`npm start` / `./run-server.sh`）。設定を読み、保存層を作って 127.0.0.1 で待ち受ける。
 *
 * macOS は `esl-writing.localhost` を IPv6 の `::1` に先に引き、ブラウザによっては 127.0.0.1 に
 * 切り替えないので、`::1` でも待ち受ける（開けない環境では warn を残して 127.0.0.1 だけ）。
 */

// dist/main.js から見た場所
const distDir = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.join(distDir, '..', 'web')
const bundleDir = path.join(distDir, 'browser')

async function main(): Promise<void> {
  const port = parsePort(process.env['PORT']?.trim() || undefined)
  const settings = loadDropboxConfig(process.env)
  const store = createParagraphStore(createDropboxClient(settings), settings.root)
  const handler = createAppHandler({ port, store, webDir, bundleDir })

  const servers: Server[] = [await listen(handler, port, BIND_HOST)]
  try {
    servers.push(await listen(handler, port, '::1'))
  } catch (error) {
    log.warn(`::1 では待ち受けられません（127.0.0.1 だけで動きます）: ${describeError(error)}`)
  }

  log.info(`保存先: ${settings.root}`)
  log.info(`開く: http://${FRIENDLY_NAME}:${port}/`)

  const stop = () => {
    for (const server of servers) server.close()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

main().catch((error: unknown) => {
  log.error(error instanceof ConfigError ? error.message : describeError(error))
  process.exitCode = 1
})
