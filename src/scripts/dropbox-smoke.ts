import assert from 'node:assert/strict'
import { loadDropboxConfig } from '../config.js'
import { createDropboxClient, type DropboxClient, isNotFoundError } from '../dropbox/client.js'
import { describeError } from '../log.js'
import { createParagraphStore, StageConflictError } from '../paragraphs/store.js'

/**
 * 本物の Dropbox で保存層を一通り動かす（`npm run dropbox:smoke`）。**書き込む。**
 *
 * 保存先の中の作業用フォルダ `<root>/.smoke-test/` だけを使い、最後にフォルダごと消す
 * （消したものは Dropbox の削除済みファイルに残る）。本物の `paragraphs/` には触れない。
 *
 * 作成 → 一覧 → 無いファイルの読み込み → add で保存 → 読み戻し → update で保存
 * → 古い rev で保存して競合になる（上書きされない）→ 削除
 */

const SMOKE_DIR = '.smoke-test'

function step(text: string): void {
  process.stdout.write(`✓ ${text}\n`)
}

async function main(): Promise<void> {
  const settings = loadDropboxConfig(process.env)
  const client = createDropboxClient(settings)
  const smokeRoot = `${settings.root}/${SMOKE_DIR}`
  const store = createParagraphStore(client, smokeRoot)
  process.stdout.write(`作業用フォルダ: ${smokeRoot}\n`)

  try {
    const today = new Date().toISOString().slice(0, 10)
    const id = await store.createParagraph(today, 'Smoke test: should students wear uniforms?')
    step(`フォルダを作成（${id}）`)

    let list = await store.listParagraphs()
    assert.equal(list.length, 1)
    assert.equal(list[0]?.id, id)
    assert.equal(list[0]?.started.draft, false)
    step('一覧に出る（段階のファイルはまだ無い）')

    const empty = await store.readStage(id, 'draft')
    assert.equal(empty.text, '')
    assert.equal(empty.rev, null)
    step('無いファイルは空文字・rev なしで読める')

    const first = await store.saveStage(
      id,
      'draft',
      'In my opinion, uniforms are not needed.',
      empty,
    )
    step(`add で保存（rev ${first.rev}）`)

    const opened = await store.readStage(id, 'draft')
    assert.equal(opened.text, 'In my opinion, uniforms are not needed.')
    assert.equal(opened.rev, first.rev)
    step('読み戻すと同じ本文と rev')

    const second = await store.saveStage(
      id,
      'draft',
      'In my opinion, students should not have to wear uniforms.',
      opened,
    )
    assert.notEqual(second.rev, first.rev)
    step(`update で保存（rev ${second.rev}）`)

    // 古い rev（別の端末で開いたままの画面）からの保存
    await assert.rejects(
      store.saveStage(id, 'draft', 'stale edit', opened),
      (error: unknown) => error instanceof StageConflictError,
    )
    const after = await store.readStage(id, 'draft')
    assert.equal(after.text, 'In my opinion, students should not have to wear uniforms.')
    step('古い rev からの保存は競合になり、上書きされない')

    await store.saveStage(id, 'ideas', '制服 → 個性・お金・季節', {
      rev: null,
      format: empty.format,
    })
    list = await store.listParagraphs()
    assert.deepEqual(list[0]?.started, {
      assignment: false,
      ideas: true,
      outline: false,
      draft: true,
    })
    step('一覧の着手済みに反映される（アイデア・下書き）')

    await store.deleteParagraph(id)
    assert.deepEqual(await store.listParagraphs(), [])
    step('フォルダごと削除できる')
  } finally {
    await cleanUp(client, smokeRoot)
  }
  process.stdout.write('すべて通りました\n')
}

/** 作業用フォルダを消す。途中で失敗していても必ず呼ぶ。消せなければ知らせて終了コードを 1 にする（元のエラーは隠さない）。 */
async function cleanUp(client: DropboxClient, smokeRoot: string): Promise<void> {
  try {
    await client.remove(smokeRoot)
    step(`作業用フォルダを削除（${smokeRoot}）`)
  } catch (error) {
    if (isNotFoundError(error)) return
    process.stderr.write(
      `✗ 作業用フォルダを消せません（手で消してください）: ${describeError(error)}\n`,
    )
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`✗ ${describeError(error)}\n`)
  process.exitCode = 1
})
