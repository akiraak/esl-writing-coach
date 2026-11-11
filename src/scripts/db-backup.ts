import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDbPath, loadDropboxConfig } from '../config.js'
import { createDropboxClient } from '../dropbox/client.js'
import { describeError } from '../log.js'
import { backupNow } from '../paragraphs/backup.js'
import { openDatabase } from '../paragraphs/database.js'
import { localDate } from '../server/api.js'

/**
 * DB を今すぐ Dropbox にバックアップする（`npm run db:backup`）。変わっていなくても上げる。
 * サーバも毎時、変わっていれば同じことをする（`src/paragraphs/backup.ts`）。
 */
async function main(): Promise<void> {
  const settings = loadDropboxConfig(process.env)
  const projectDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const dbPath = loadDbPath(
    process.env,
    projectDir,
    path.join(projectDir, 'data', 'esl-writing.db'),
  )
  const db = openDatabase(dbPath)
  try {
    const uploaded = await backupNow({
      db,
      client: createDropboxClient(settings),
      root: settings.root,
      tempFile: `${dbPath}.backup-tmp`,
      today: () => localDate(),
    })
    process.stdout.write(`上げました: ${uploaded}\n`)
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${describeError(error)}\n`)
  process.exitCode = 1
})
