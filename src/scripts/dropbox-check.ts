import { loadDropboxConfig } from '../config.js'
import { createDropboxClient } from '../dropbox/client.js'
import { describeError } from '../log.js'
import { createParagraphStore, PARAGRAPHS_DIR } from '../paragraphs/store.js'

/**
 * Dropbox に繋がることを確かめる（`npm run dropbox:check`）。**読むだけ**で、何も書かない。
 *
 * 保存先の `paragraphs/` を一覧して、パラグラフの件数と、段階ごとに着手済みの件数だけを出す。
 * 本文（ファイルの中身）は読まない。
 */
async function main(): Promise<void> {
  const settings = loadDropboxConfig(process.env)
  const client = createDropboxClient(settings)
  const store = createParagraphStore(client, settings.root)

  // トークンの更新だけ先に確かめる（設定の誤りをここで切り分ける）
  await client.accessToken()
  process.stdout.write('アクセストークンを取得しました\n')

  const list = await store.listParagraphs()
  process.stdout.write(`${settings.root}/${PARAGRAPHS_DIR} を一覧しました\n`)
  if (list.length === 0) {
    process.stdout.write(
      '  パラグラフ: 0 件（フォルダはまだ無いか空。最初の新規作成で作られます）\n',
    )
    return
  }
  const count = (stage: 'assignment' | 'ideas' | 'outline' | 'draft') =>
    list.filter((p) => p.started[stage]).length
  process.stdout.write(`  パラグラフ: ${list.length} 件（最新の更新 ${list[0]?.updatedAt}）\n`)
  process.stdout.write(
    `  着手済み: 課題 ${count('assignment')} / アイデア ${count('ideas')} / ` +
      `アウトライン ${count('outline')} / 下書き ${count('draft')}\n`,
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${describeError(error)}\n`)
  process.exitCode = 1
})
