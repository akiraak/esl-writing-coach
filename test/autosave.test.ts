import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  combineSaveStates,
  createAutosave,
  type SaveState,
  type Timer,
} from '../src/shared/autosave.js'
import type { SaveBase, SavedStage } from '../src/shared/types.js'

/** 手で進める偽のタイマー。 */
function fakeTimer() {
  let now = 0
  let seq = 0
  const pending = new Map<number, { at: number; fn: () => void }>()
  const timer: Timer = {
    set(fn, ms) {
      seq += 1
      pending.set(seq, { at: now + ms, fn })
      return seq
    },
    clear(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    timer,
    get count() {
      return pending.size
    },
    advance(ms: number) {
      now += ms
      for (const [id, entry] of [...pending]) {
        if (entry.at <= now) {
          pending.delete(id)
          entry.fn()
        }
      }
    },
  }
}

class Conflict extends Error {}

/** 保存の偽物。`hold` にすると終わらせるまで待たせる。 */
function fakeSave() {
  const calls: Array<{ text: string; base: SaveBase }> = []
  let revs = 0
  let failure: Error | null = null
  let held: Array<() => void> = []
  let hold = false
  const save = async (text: string, base: SaveBase): Promise<SavedStage> => {
    calls.push({ text, base })
    if (hold) await new Promise<void>((resolve) => held.push(resolve))
    if (failure !== null) throw failure
    revs += 1
    return { rev: `r${revs}`, updatedAt: `2026-11-08T00:00:0${revs}Z` }
  }
  return {
    save,
    calls,
    fail(error: Error | null) {
      failure = error
    },
    hold(on: boolean) {
      hold = on
    },
    release() {
      const list = held
      held = []
      for (const resolve of list) resolve()
    },
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function setup(text = '', rev: string | null = null) {
  const t = fakeTimer()
  const s = fakeSave()
  const states: SaveState[] = []
  const autosave = createAutosave({
    text,
    base: { rev },
    save: s.save,
    isConflict: (error) => error instanceof Conflict,
    describeError: (error) => (error instanceof Error ? error.message : String(error)),
    onChange: (state) => states.push(state),
    timer: t.timer,
    delayMs: 3000,
  })
  return { t, s, states, autosave }
}

describe('createAutosave', () => {
  it('打ち終わって 3 秒で保存する。続けて打てば延びる', async () => {
    const { t, s, autosave } = setup()
    autosave.update('I')
    t.advance(2000)
    autosave.update('In')
    t.advance(2000)
    assert.equal(s.calls.length, 0)
    assert.equal(autosave.state.kind, 'dirty')
    t.advance(1000)
    await tick()
    assert.deepEqual(
      s.calls.map((c) => c.text),
      ['In'],
    )
    assert.deepEqual(autosave.state, { kind: 'saved', at: '2026-11-08T00:00:01Z' })
    assert.equal(autosave.hasUnsavedChanges, false)
  })

  it('保存できたら新しい rev を次の保存に使う', async () => {
    const { t, s, autosave } = setup('a', 'r0')
    autosave.update('ab')
    t.advance(3000)
    await tick()
    autosave.update('abc')
    t.advance(3000)
    await tick()
    assert.deepEqual(
      s.calls.map((c) => c.base.rev),
      ['r0', 'r1'],
    )
  })

  it('元に戻したら保存しない（保存済みに戻る）', async () => {
    const { t, s, autosave } = setup('same')
    autosave.update('samex')
    autosave.update('same')
    assert.equal(autosave.state.kind, 'saved')
    assert.equal(t.count, 0)
    t.advance(5000)
    await tick()
    assert.equal(s.calls.length, 0)
  })

  it('保存中に打てば、終わってからもう一度保存する（同時に 2 つは送らない）', async () => {
    const { t, s, autosave } = setup()
    s.hold(true)
    autosave.update('one')
    t.advance(3000)
    await tick()
    assert.equal(autosave.state.kind, 'saving')
    autosave.update('one two')
    t.advance(3000)
    await tick()
    assert.equal(s.calls.length, 1)
    s.hold(false)
    s.release()
    await tick()
    assert.equal(autosave.state.kind, 'dirty')
    t.advance(3000)
    await tick()
    assert.deepEqual(
      s.calls.map((c) => c.text),
      ['one', 'one two'],
    )
    assert.equal(s.calls[1]?.base.rev, 'r1')
    assert.equal((autosave.state as SaveState).kind, 'saved')
  })

  it('競合を見たら自動保存を止め、手元の内容は残す（黙って再送しない）', async () => {
    const { t, s, autosave } = setup('x', 'r0')
    s.fail(new Conflict())
    autosave.update('mine')
    t.advance(3000)
    await tick()
    assert.deepEqual(autosave.state, { kind: 'conflict' })
    s.fail(null)
    autosave.update('mine more')
    t.advance(10_000)
    await autosave.flush()
    autosave.retry()
    await tick()
    assert.equal(s.calls.length, 1)
    assert.equal(autosave.hasUnsavedChanges, true)
  })

  it('失敗したら error。retry で保存し直す', async () => {
    const { t, s, autosave } = setup()
    s.fail(new Error('Dropbox に繋がりません'))
    autosave.update('a')
    t.advance(3000)
    await tick()
    assert.deepEqual(autosave.state, { kind: 'error', message: 'Dropbox に繋がりません' })
    s.fail(null)
    autosave.retry()
    await tick()
    assert.equal(autosave.state.kind, 'saved')
    assert.equal(s.calls.length, 2)
  })

  it('失敗のあと、次に打てばまた 3 秒で保存する', async () => {
    const { t, s, autosave } = setup()
    s.fail(new Error('x'))
    autosave.update('a')
    t.advance(3000)
    await tick()
    s.fail(null)
    autosave.update('ab')
    assert.equal(autosave.state.kind, 'dirty')
    t.advance(3000)
    await tick()
    assert.deepEqual(
      s.calls.map((c) => c.text),
      ['a', 'ab'],
    )
  })

  it('flush は待たずに保存する。保存中ならその終わりを待ってから残りを保存する', async () => {
    const { t, s, autosave } = setup()
    autosave.update('a')
    await autosave.flush()
    assert.deepEqual(
      s.calls.map((c) => c.text),
      ['a'],
    )
    assert.equal(t.count, 0)

    s.hold(true)
    autosave.update('ab')
    const first = autosave.flush()
    await tick()
    autosave.update('abc')
    const second = autosave.flush()
    s.hold(false)
    s.release()
    await first
    await second
    assert.deepEqual(
      s.calls.map((c) => c.text),
      ['a', 'ab', 'abc'],
    )
    assert.equal(autosave.hasUnsavedChanges, false)
  })

  it('変更が無ければ flush しても保存しない', async () => {
    const { s, autosave } = setup('a')
    await autosave.flush()
    assert.equal(s.calls.length, 0)
  })

  it('dispose のあとはタイマーで保存しない', async () => {
    const { t, s, autosave } = setup()
    autosave.update('a')
    autosave.dispose()
    t.advance(5000)
    await tick()
    assert.equal(s.calls.length, 0)
  })
})

describe('combineSaveStates', () => {
  it('競合 > 保存できません > 保存中 > 未保存 > 保存済み', () => {
    const saved: SaveState = { kind: 'saved', at: null }
    assert.deepEqual(combineSaveStates([saved, { kind: 'dirty' }]), { kind: 'dirty' })
    assert.deepEqual(combineSaveStates([{ kind: 'dirty' }, { kind: 'saving' }]), { kind: 'saving' })
    assert.deepEqual(
      combineSaveStates([{ kind: 'saving' }, { kind: 'error', message: 'x' }, saved]),
      { kind: 'error', message: 'x' },
    )
    assert.deepEqual(combineSaveStates([{ kind: 'conflict' }, { kind: 'error', message: 'x' }]), {
      kind: 'conflict',
    })
  })

  it('全部が保存済みなら、いちばん新しい保存の時刻', () => {
    assert.deepEqual(
      combineSaveStates([
        { kind: 'saved', at: '2026-11-08T01:00:00Z' },
        { kind: 'saved', at: null },
        { kind: 'saved', at: '2026-11-08T03:00:00Z' },
      ]),
      { kind: 'saved', at: '2026-11-08T03:00:00Z' },
    )
    assert.deepEqual(combineSaveStates([]), { kind: 'saved', at: null })
  })
})
