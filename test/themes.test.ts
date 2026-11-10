import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NEW_FILE_FORMAT, type ParagraphSummary, type Stage } from '../src/paragraphs/store.js'
import { createThemeReader } from '../src/paragraphs/themes.js'

/** 一覧のテーマ。保存層は readStage だけの偽物。 */

function summary(id: string, assignment?: { rev: string; size: number }): ParagraphSummary {
  return {
    id,
    createdOn: id.slice(0, 10),
    updatedAt: `${id.slice(0, 10)}T00:00:00Z`,
    files:
      assignment === undefined
        ? {}
        : { assignment: { ...assignment, serverModified: '2026-11-08T00:00:00Z' } },
    started: {
      assignment: (assignment?.size ?? 0) > 0,
      outline: false,
      draft: false,
    },
  }
}

function fakeStore(files: Record<string, { text: string; rev: string } | Error>) {
  const reads: string[] = []
  let active = 0
  let maxActive = 0
  return {
    reads,
    get maxActive() {
      return maxActive
    },
    files,
    async readStage(id: string, stage: Stage) {
      reads.push(`${id}/${stage}`)
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setImmediate(resolve))
      active -= 1
      const file = files[id]
      if (file instanceof Error) throw file
      if (file === undefined) return { text: '', rev: null, format: NEW_FILE_FORMAT }
      return { text: file.text, rev: file.rev, format: NEW_FILE_FORMAT }
    },
  }
}

describe('createThemeReader', () => {
  it('assignment.md の # 行をテーマにする', async () => {
    const store = fakeStore({ '2026-11-08-a': { text: '# School uniforms\n', rev: 'r1' } })
    const items = await createThemeReader(store).withThemes([
      summary('2026-11-08-a', { rev: 'r1', size: 18 }),
    ])
    assert.equal(items[0]?.theme, 'School uniforms')
    assert.equal(items[0]?.id, '2026-11-08-a')
  })

  it('rev が同じなら読み直さず、変われば読み直す', async () => {
    const store = fakeStore({ '2026-11-08-a': { text: '# One\n', rev: 'r1' } })
    const reader = createThemeReader(store)
    await reader.withThemes([summary('2026-11-08-a', { rev: 'r1', size: 6 })])
    const again = await reader.withThemes([summary('2026-11-08-a', { rev: 'r1', size: 6 })])
    assert.equal(again[0]?.theme, 'One')
    assert.equal(store.reads.length, 1)

    store.files['2026-11-08-a'] = { text: '# Two\n', rev: 'r2' }
    const changed = await reader.withThemes([summary('2026-11-08-a', { rev: 'r2', size: 6 })])
    assert.equal(changed[0]?.theme, 'Two')
    assert.equal(store.reads.length, 2)
  })

  it('assignment.md が無い・0 バイトなら読まずに空', async () => {
    const store = fakeStore({})
    const items = await createThemeReader(store).withThemes([
      summary('2026-11-08-a'),
      summary('2026-11-08-b', { rev: 'r1', size: 0 }),
    ])
    assert.deepEqual(
      items.map((i) => i.theme),
      ['', ''],
    )
    assert.deepEqual(store.reads, [])
  })

  it('読めない件は空にして、ほかは返す', async () => {
    const store = fakeStore({
      '2026-11-08-a': new Error('boom'),
      '2026-11-08-b': { text: '# B\n', rev: 'r1' },
    })
    const items = await createThemeReader(store).withThemes([
      summary('2026-11-08-a', { rev: 'r9', size: 4 }),
      summary('2026-11-08-b', { rev: 'r1', size: 4 }),
    ])
    assert.deepEqual(
      items.map((i) => i.theme),
      ['', 'B'],
    )
  })

  it('同時に読むのは上限まで・順番は一覧のまま', async () => {
    const files: Record<string, { text: string; rev: string }> = {}
    const list: ParagraphSummary[] = []
    for (let i = 0; i < 20; i += 1) {
      const id = `2026-11-08-p${i}`
      files[id] = { text: `# T${i}\n`, rev: 'r1' }
      list.push(summary(id, { rev: 'r1', size: 5 }))
    }
    const store = fakeStore(files)
    const items = await createThemeReader(store, 3).withThemes(list)
    assert.equal(store.maxActive, 3)
    assert.deepEqual(
      items.map((i) => i.theme),
      list.map((_, i) => `T${i}`),
    )
  })
})
