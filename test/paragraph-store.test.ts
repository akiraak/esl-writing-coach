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

describe('DB の版', () => {
  it('版 1 の DB を開くと、データを残したまま今の版（AI案への質問・AI に質問の表）に上がる', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'esl-db-'))
    try {
      const file = path.join(dir, 'v1.db')
      // 版 1 の形を手で作る（ai_questions・draft_questions が無い。保存層は今の表を前提にするので SQL で入れる）
      const v1 = openDatabase(file)
      v1.exec(`
        DROP TABLE ai_questions;
        DROP TABLE draft_questions;
        DROP TABLE translations;
        UPDATE meta SET value = '1' WHERE key = 'schema_version';
        INSERT INTO paragraphs (id, created_on, created_at) VALUES ('2026-11-11-old', '2026-11-11', '2026-11-11T00:00:00.000Z');
      `)
      v1.close()
      const db = openDatabase(file)
      assert.equal(readMeta(db, 'schema_version'), String(SCHEMA_VERSION))
      const store = createParagraphStore(db)
      const id = store.listParagraphs()[0]?.id ?? ''
      assert.equal(id, '2026-11-11-old')
      store.saveAiResult(id, 'ideas', '{}')
      store.addAiQuestion(id, 'ideas', 'q', 'a')
      assert.equal(store.readAiQuestions(id).ideas.length, 1)
      store.addDraftQuestion(id, 'q', 'a')
      assert.equal(store.readDraftQuestions(id).length, 1)
      db.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('版 2 の DB を開くと、AI案への質問を残したまま今の版（AI に質問・日本語訳の表）に上がる', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'esl-db-'))
    try {
      const file = path.join(dir, 'v2.db')
      const v2 = openDatabase(file)
      const id = createParagraphStore(v2).createParagraph('2026-11-11', 'Old', assignment('Old'))
      createParagraphStore(v2).saveAiResult(id, 'ideas', '{}')
      createParagraphStore(v2).addAiQuestion(id, 'ideas', 'q', 'a')
      v2.exec(`
        DROP TABLE draft_questions;
        DROP TABLE translations;
        UPDATE meta SET value = '2' WHERE key = 'schema_version';
      `)
      v2.close()
      const db = openDatabase(file)
      assert.equal(readMeta(db, 'schema_version'), String(SCHEMA_VERSION))
      const store = createParagraphStore(db)
      assert.equal(store.readStage(id, 'assignment').text, assignment('Old'))
      assert.equal(store.readAiQuestions(id).ideas.length, 1)
      assert.deepEqual(store.readDraftQuestions(id), [])
      db.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('版 3 の DB を開くと、データを残したまま版 4（日本語訳の表）に上がる', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'esl-db-'))
    try {
      const file = path.join(dir, 'v3.db')
      const v3 = openDatabase(file)
      const id = createParagraphStore(v3).createParagraph('2026-11-11', 'Old', assignment('Old'))
      createParagraphStore(v3).addDraftQuestion(id, 'q', 'a')
      v3.exec(`
        DROP TABLE translations;
        UPDATE meta SET value = '3' WHERE key = 'schema_version';
      `)
      v3.close()
      const db = openDatabase(file)
      assert.equal(readMeta(db, 'schema_version'), '4')
      const store = createParagraphStore(db)
      assert.equal(store.readDraftQuestions(id).length, 1)
      assert.equal(store.readTranslation(id), null)
      store.saveTranslation(id, '{}')
      assert.equal(store.readTranslation(id), '{}')
      db.close()
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
    // 日本語訳も最新の 1 回分だけ
    assert.equal(store.readTranslation(a), null)
    store.saveTranslation(a, '{"t":1}')
    store.saveTranslation(a, '{"t":2}')
    assert.equal(store.readTranslation(a), '{"t":2}')
    assert.equal(store.readTranslation(b), null)
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

  it('AI案への質問は種類ごとに古い順。AI案を出し直すと、その種類の分だけ消える', () => {
    const { store } = setup()
    const id = store.createParagraph('2026-11-11', 'A', assignment('A'))
    store.saveAiResult(id, 'ideas', '{}')
    store.saveAiResult(id, 'outline', '{}')
    const first = store.addAiQuestion(id, 'ideas', 'q1', 'a1')
    store.addAiQuestion(id, 'ideas', 'q2', 'a2')
    store.addAiQuestion(id, 'outline', 'q3', 'a3')
    assert.deepEqual(first, { question: 'q1', answer: 'a1', createdAt: first.createdAt })
    const before = store.readAiQuestions(id)
    assert.deepEqual(
      before.ideas.map((q) => q.question),
      ['q1', 'q2'],
    )
    assert.deepEqual(before.themes, [])
    store.saveAiResult(id, 'ideas', '{"v":2}')
    const after = store.readAiQuestions(id)
    assert.deepEqual(after.ideas, [])
    assert.deepEqual(
      after.outline.map((q) => q.question),
      ['q3'],
    )
  })

  it('「AI に質問」のやりとりはパラグラフごとに古い順。消すとそのパラグラフの分だけ消える', () => {
    const { store } = setup()
    const a = store.createParagraph('2026-11-11', 'A', assignment('A'))
    const b = store.createParagraph('2026-11-11', 'B', assignment('B'))
    assert.deepEqual(store.readDraftQuestions(a), [])
    const first = store.addDraftQuestion(a, 'q1', 'a1')
    store.addDraftQuestion(a, 'q2', 'a2')
    store.addDraftQuestion(b, 'q3', 'a3')
    assert.deepEqual(first, { question: 'q1', answer: 'a1', createdAt: first.createdAt })
    assert.deepEqual(
      store.readDraftQuestions(a).map((q) => q.question),
      ['q1', 'q2'],
    )
    store.clearDraftQuestions(a)
    assert.deepEqual(store.readDraftQuestions(a), [])
    assert.equal(store.readDraftQuestions(b).length, 1)
    // 消したあとも続きから足せる
    store.addDraftQuestion(a, 'q4', 'a4')
    assert.equal(store.readDraftQuestions(a)[0]?.question, 'q4')
    store.deleteParagraph(a)
    assert.throws(() => store.readDraftQuestions(a), ParagraphNotFoundError)
    assert.throws(() => store.addDraftQuestion(a, 'q', 'a'), ParagraphNotFoundError)
  })
})
