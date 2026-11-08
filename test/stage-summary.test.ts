import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countWords, describeRange, summarizeStage } from '../src/shared/stage-summary.js'

describe('countWords（仮の数え方）', () => {
  it('英単語を数える。短縮形・ハイフン・小数は 1 語', () => {
    assert.equal(countWords(''), 0)
    assert.equal(countWords('In my opinion, students should not wear uniforms.'), 8)
    assert.equal(countWords("I don't think it's well-known."), 5)
    assert.equal(countWords('It costs 3.5 times more.'), 5)
    assert.equal(countWords('First,second'), 2)
  })
})

describe('describeRange', () => {
  it('幅・以上・以下・ちょうど・指定なし', () => {
    assert.equal(describeRange({ min: 120, max: 150 }, '語'), '120–150 語')
    assert.equal(describeRange({ min: 120, max: null }, '語'), '120 語以上')
    assert.equal(describeRange({ min: null, max: 150 }, '語'), '150 語以下')
    assert.equal(describeRange({ min: 8, max: 8 }, '文'), '8 文')
    assert.equal(describeRange({ min: null, max: null }, '語'), null)
  })
})

describe('summarizeStage', () => {
  it('空なら未着手', () => {
    for (const stage of ['assignment', 'ideas', 'outline', 'draft'] as const) {
      assert.equal(summarizeStage(stage, ' \n\n'), '未着手')
    }
  })

  it('課題は語数の指定、無ければ文数、どちらも無ければ指定なし', () => {
    assert.equal(
      summarizeStage('assignment', '# T\n\n- 語数: 120-150\n- 文数: 8-10\n'),
      '120–150 語',
    )
    assert.equal(summarizeStage('assignment', '# T\n\n- 語数:\n- 文数: 8-10\n'), '8–10 文')
    assert.equal(summarizeStage('assignment', '# T\n\n- 語数:\n- 文数:\n'), '指定なし')
  })

  it('アイデア・アウトラインは空でない行、下書きは語数', () => {
    assert.equal(summarizeStage('ideas', 'a\n\n b\nc\n'), '3 行')
    assert.equal(summarizeStage('outline', '意見\n  理由1\n    例\n'), '3 項目')
    assert.equal(summarizeStage('draft', 'I agree with this idea.'), '5 語')
  })
})
