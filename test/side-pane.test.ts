import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampPaneWidth,
  guideTabFor,
  maxPaneWidth,
  PANE_WIDTH,
  parseStoredPaneWidth,
} from '../src/shared/side-pane.js'

describe('guideTabFor', () => {
  it('選んでいなければ段階のおすすめ（課題 = 構成、アウトライン = モデル文、下書き = 表現集）', () => {
    assert.equal(guideTabFor('assignment', {}), 'structure')
    assert.equal(guideTabFor('outline', {}), 'model')
    assert.equal(guideTabFor('draft', {}), 'phrases')
  })

  it('その段階で選んだタブがあればそれ。ほかの段階の選択は効かない', () => {
    const chosen = { outline: 'phrases' } as const
    assert.equal(guideTabFor('outline', chosen), 'phrases')
    assert.equal(guideTabFor('draft', chosen), 'phrases')
    assert.equal(guideTabFor('assignment', chosen), 'structure')
  })
})

describe('maxPaneWidth', () => {
  it('広い画面では 560px、狭い画面では中央が 560px 残るまで下げる', () => {
    assert.equal(maxPaneWidth(1400), 560)
    assert.equal(maxPaneWidth(1236), 476)
  })

  it('とても狭くても下限より下げない', () => {
    assert.equal(maxPaneWidth(900), PANE_WIDTH.min)
  })
})

describe('clampPaneWidth', () => {
  it('下限〜上限に収めて整数にする', () => {
    assert.equal(clampPaneWidth(100, 1400), 300)
    assert.equal(clampPaneWidth(900, 1400), 560)
    assert.equal(clampPaneWidth(400.6, 1400), 401)
    assert.equal(clampPaneWidth(520, 1236), 476)
  })

  it('数でなければ既定', () => {
    assert.equal(clampPaneWidth(Number.NaN, 1400), PANE_WIDTH.default)
  })
})

describe('parseStoredPaneWidth', () => {
  it('範囲の中の整数だけを受け付ける', () => {
    assert.equal(parseStoredPaneWidth('420'), 420)
    assert.equal(parseStoredPaneWidth(null), null)
    assert.equal(parseStoredPaneWidth(''), null)
    assert.equal(parseStoredPaneWidth('abc'), null)
    assert.equal(parseStoredPaneWidth('12.5'), null)
    assert.equal(parseStoredPaneWidth('200'), null)
    assert.equal(parseStoredPaneWidth('9999'), null)
  })
})
