import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { meterOf } from '../src/shared/meter.js'

describe('meterOf', () => {
  it('指定なし', () => {
    const m = meterOf(68, { min: null, max: null }, '語')
    assert.equal(m.status, 'none')
    assert.equal(m.message, '指定なし')
    assert.equal(m.band, null)
  })

  it('足りない・範囲内・多い（モックと同じ位置）', () => {
    const under = meterOf(68, { min: 120, max: 150 }, '語')
    assert.equal(under.status, 'under')
    assert.equal(under.message, 'あと 52 語')
    // 目盛りの最大は 150 × 1.2 = 180
    assert.equal(Math.round(under.fill * 10) / 10, 37.8)
    assert.deepEqual(
      under.ticks.map((t) => [t.value, Math.round(t.at * 10) / 10]),
      [
        [120, 66.7],
        [150, 83.3],
      ],
    )
    assert.equal(meterOf(130, { min: 120, max: 150 }, '語').message, '範囲内')
    assert.equal(meterOf(120, { min: 120, max: 150 }, '語').status, 'within')
    const over = meterOf(162, { min: 120, max: 150 }, '語')
    assert.equal(over.status, 'over')
    assert.equal(over.message, '12 語多い')
  })

  it('数が目盛りの最大を超えたら、数を最大にする', () => {
    const m = meterOf(300, { min: 120, max: 150 }, '語')
    assert.equal(m.fill, 100)
    assert.equal(m.ticks[1]?.at, 50)
  })

  it('下限だけ・上限だけ・ちょうど', () => {
    const atLeast = meterOf(5, { min: 8, max: null }, '文')
    assert.equal(atLeast.message, 'あと 3 文')
    assert.equal(atLeast.band?.to, 100)
    assert.equal(meterOf(9, { min: 8, max: null }, '文').status, 'within')
    const atMost = meterOf(0, { min: null, max: 10 }, '文')
    assert.equal(atMost.status, 'within')
    assert.equal(atMost.band?.from, 0)
    assert.equal(meterOf(11, { min: null, max: 10 }, '文').message, '1 文多い')
    const exact = meterOf(10, { min: 10, max: 10 }, '文')
    assert.equal(exact.status, 'within')
    assert.equal(exact.ticks.length, 1)
  })
})
