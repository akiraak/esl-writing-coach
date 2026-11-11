import type { Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAi } from './ai/client.js'
import {
  BIND_HOST,
  ConfigError,
  loadAiConfig,
  loadDbPath,
  loadDropboxConfig,
  parsePort,
} from './config.js'
import { createDropboxClient } from './dropbox/client.js'
import { describeError, log } from './log.js'
import { startBackups } from './paragraphs/backup.js'
import { openDatabase } from './paragraphs/database.js'
import { createParagraphStore } from './paragraphs/store.js'
import { localDate } from './server/api.js'
import { FRIENDLY_NAME } from './server/guard.js'
import { createAppHandler, listen } from './server/server.js'

/**
 * 起動（`npm start` / `./run-server.sh`）。設定を読み、DB を開いて 127.0.0.1 で待ち受ける。
 *
 * - データはローカルの SQLite（既定は `data/esl-writing.db`）。Dropbox の設定があれば DB を毎時バックアップする（変わっていれば）
 * - macOS は `esl-writing.localhost` を IPv6 の `::1` に先に引き、ブラウザによっては 127.0.0.1 に
 *   切り替えないので、`::1` でも待ち受ける（開けない環境では warn を残して 127.0.0.1 だけ）
 */

// dist/main.js から見た場所
const distDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.join(distDir, '..')
const webDir = path.join(projectDir, 'web')
const bundleDir = path.join(distDir, 'browser')
export const DEFAULT_DB_PATH = path.join(projectDir, 'data', 'esl-writing.db')

async function main(): Promise<void> {
  const port = parsePort(process.env['PORT']?.trim() || undefined)
  const dbPath = loadDbPath(process.env, projectDir, DEFAULT_DB_PATH)
  const db = openDatabase(dbPath)
  const store = createParagraphStore(db)
  const aiSettings = loadAiConfig(process.env)
  const ai = aiSettings === null ? null : createAi(aiSettings.apiKey)
  const handler = createAppHandler({ port, store, webDir, bundleDir, ai })

  const servers: Server[] = [await listen(handler, port, BIND_HOST)]
  try {
    servers.push(await listen(handler, port, '::1'))
  } catch (error) {
    log.warn(`::1 では待ち受けられません（127.0.0.1 だけで動きます）: ${describeError(error)}`)
  }

  log.info(`DB: ${dbPath}`)
  let stopBackups = () => {}
  try {
    const settings = loadDropboxConfig(process.env)
    stopBackups = startBackups({
      db,
      client: createDropboxClient(settings),
      root: settings.root,
      tempFile: `${dbPath}.backup-tmp`,
      today: () => localDate(),
    })
    log.info(`バックアップ先: ${settings.root}/backups（変わっていれば毎時）`)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    log.warn(`Dropbox の設定が無いので、DB のバックアップはしません: ${error.message}`)
  }
  if (ai === null) log.warn('ANTHROPIC_API_KEY が無いので、AI（採点・アイデア出し）は使えません')
  log.info(`開く: http://${FRIENDLY_NAME}:${port}/`)

  const stop = () => {
    stopBackups()
    // 受け付け中のリクエストが終わってから DB を閉じる
    let open = servers.length
    for (const server of servers) {
      server.close(() => {
        open -= 1
        if (open === 0) db.close()
      })
    }
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

main().catch((error: unknown) => {
  log.error(error instanceof ConfigError ? error.message : describeError(error))
  process.exitCode = 1
})
