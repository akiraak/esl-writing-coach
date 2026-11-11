import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { openDatabase, readMeta, SCHEMA_VERSION } from '../src/paragraphs/database.js'
import {
  createParagraphStore,
  InvalidParagraphIdError,
  ParagraphNotFoundError,
  StageConflictError,
} from '../src/paragraphs/store.js'

/** 保存層（SQLite）。`:memory:` の DB で確かめる。時刻は呼ぶたびに 1 秒進める。 */
function setup() {
  const db = openDatabase(':memory:')
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 10, 11, 0, 0, tick++)).toISOString()
  return { db, store: createParagraphStore(db, { now }) }
}

const assignment = (theme: string) => `# ${theme}\n`

describe('DB を開く', () => {
  it('表を作り、版を覚える。もう一度開いても作り直さない', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'esl-db-'))
    try {
      const file = path.join(dir, 'nested', 'esl.db')
      const first = openDatabase(file)
      createParagraphStore(first).createParagraph('2026-11-11', 'Keep', assignment('Keep'))
      first.close()
      const second = openDatabase(file)
      assert.equal(readMeta(second, 'schema_version'), String(SCHEMA_VERSION))
      assert.equal(createParagraphStore(second).listParagraphs()[0]?.theme, 'Keep')
      second.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('作成と一覧', () => {
  it('作成で課題の本文も入り、一覧にテーマと進み具合が出る', () => {
    const { store } = setup()
    const id = store.createParagraph('2026-11-11', 'School uniforms', assignment('School uniforms'))
    assert.equal(id, '2026-11-11-school-uniforms')
    assert.deepEqual(store.readStage(id, 'assignment'), {
      text: assignment('School uniforms'),
      rev: '1',
    })
    assert.deepEqual(store.listParagraphs(), [
      {
        id,
        createdOn: '2026-11-11',
        updatedAt: '2026-11-11T00:00:00.000Z',
        started: { assignment: true, outline: false, draft: false },
        theme: 'School uniforms',
      },
    ])
  })

  it('同じ id があれば -2, -3 を付ける（消したものの id も使わない）', () => {
    const { store } = setup()
    const a = store.createParagraph('2026-11-11', 'Pets', assignment('Pets'))
    store.deleteParagraph(a)
    const b = store.createParagraph('2026-11-11', 'Pets', assignment('Pets'))
    const c = store.createParagraph('2026-11-11', 'Pets', assignment('Pets'))
    assert.deepEqual([a, b, c], ['2026-11-11-pets', '2026-11-11-pets-2', '2026-11-11-pets-3'])
  })

  it('一覧は新しく保存した順。空の段階は未着手', () => {
    const { store } = setup()
    const older = store.createParagraph('2026-11-10', 'Older', assignment('Older'))
    const newer = store.createParagraph('2026-11-11', 'Newer', assignment('Newer'))
    store.saveStage(older, 'draft', 'Hello.', null)
    store.saveStage(older, 'outline', '', null)
    const list = store.listParagraphs()
    assert.deepEqual(
      list.map((p) => p.id),
      [older, newer],
    )
    assert.deepEqual(list[0]?.started, { assignment: true, outline: false, draft: true })
  })
})

describe('段階の読み書き', () => {
  it('まだ無い段階は空で rev は null。保存するたびに rev が増える', () => {
    const { store } = setup()
    const id = store.createParagraph('2026-11-11', 'A', assignment('A'))
    assert.deepEqual(store.readStage(id, 'draft'), { text: '', rev: null })
    const first = store.saveStage(id, 'draft', 'One.', null)
    assert.equal(first.rev, '1')
    const second = store.saveStage(id, 'draft', 'One. Two.', first.rev)
    assert.equal(second.rev, '2')
    assert.deepEqual(store.readStage(id, 'draft'), { text: 'One. Two.', rev: '2' })
  })

  it('rev が合わない・既にあるのに null・数字でない rev は競合（上書きしない）', () => {
    const { store } = setup()
    const id = store.createParagraph('2026-11-11', 'A', assignment('A'))
    const saved = store.saveStage(id, 'draft', 'Mine.', null)
    store.saveStage(id, 'draft', 'Other tab.', saved.rev)
    assert.throws(() => store.saveStage(id, 'draft', 'Stale.', saved.rev), StageConflictError)
    assert.throws(() => store.saveStage(id, 'draft', 'New?', null), StageConflictError)
    assert.throws(() => store.saveStage(id, 'draft', 'Old rev.', '015f2a3b'), StageConflictError)
    assert.equal(store.readStage(id, 'draft').text, 'Other tab.')
  })

  it('id の形が違えば InvalidParagraphIdError、無い・消したパラグラフは ParagraphNotFoundError', () => {
    const { store } = setup()
    assert.throws(() => store.readStage('../etc', 'draft'), InvalidParagraphIdError)
    assert.throws(() => store.readStage('2026-11-11-none', 'draft'), ParagraphNotFoundError)
    const id = store.createParagraph('2026-11-11', 'A', assignment('A'))
    store.deleteParagraph(id)
    store.deleteParagraph(id)
    assert.throws(() => store.saveStage(id, 'draft', 'x', null), ParagraphNotFoundError)
    assert.deepEqual(store.listParagraphs(), [])
  })
})

describe('採点と AI案', () => {
  it('採点は最新の 1 回分を持ち、振り返りでは消したものを除いてテーマ付きで返す', () => {
    const { store } = setup()
    const a = store.createParagraph('2026-11-11', 'A', assignment('Theme A'))
    const b = store.createParagraph('2026-11-11', 'B', assignment('Theme B'))
    assert.equal(store.readFeedback(a), null)
    store.saveFeedback(a, '{"n":1}')
    store.saveFeedback(a, '{"n":2}')
    store.saveFeedback(b, '{"n":3}')
    assert.equal(store.readFeedback(a), '{"n":2}')
    store.deleteParagraph(b)
    assert.deepEqual(store.listFeedbacks(), [{ id: a, theme: 'Theme A', json: '{"n":2}' }])
  })

  it('AI案は種類ごとに最新の 1 回分。消したパラグラフには書かない', () => {
    const { store } = setup()
    const id = store.createParagraph('2026-11-11', 'A', assignment('A'))
    assert.deepEqual(store.readAiResults(id), {})
    store.saveAiResult(id, 'ideas', '{"v":1}')
    store.saveAiResult(id, 'ideas', '{"v":2}')
    store.saveAiResult(id, 'outline', '{"o":1}')
    assert.deepEqual(store.readAiResults(id), { ideas: '{"v":2}', outline: '{"o":1}' })
    store.deleteParagraph(id)
    assert.doesNotThrow(() => store.saveAiResult(id, 'themes', '{}'))
  })
})
