import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeCountRange, describeRange, summarizeStage } from '../src/shared/stage-summary.js'

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
    for (const stage of ['assignment', 'outline', 'draft'] as const) {
      assert.equal(summarizeStage(stage, ' \n\n', 'ja'), '未着手')
    }
  })

  it('課題は語数の指定、無ければ文数、どちらも無ければ指定なし', () => {
    assert.equal(
      summarizeStage('assignment', '# T\n\n- 語数: 120-150\n- 文数: 8-10\n', 'ja'),
      '120–150 語',
    )
    assert.equal(summarizeStage('assignment', '# T\n\n- 語数:\n- 文数: 8-10\n', 'ja'), '8–10 文')
    assert.equal(summarizeStage('assignment', '# T\n\n- 語数:\n- 文数:\n', 'ja'), '指定なし')
  })

  it('アウトラインは理由の数（無ければ行）、下書きは語数', () => {
    assert.equal(
      summarizeStage('outline', '意見\n  理由1\n    例\n  理由2\n  結論\n', 'ja'),
      '理由 2',
    )
    assert.equal(summarizeStage('outline', '意見だけ\n', 'ja'), '1 項目')
    assert.equal(summarizeStage('draft', 'I agree with this idea.', 'ja'), '5 語')
  })
})

describe('英語の UI', () => {
  it('describeCountRange: 単数・複数と幅', () => {
    assert.equal(describeCountRange({ min: 120, max: 150 }, 'words', 'en'), '120–150 words')
    assert.equal(describeCountRange({ min: 120, max: null }, 'words', 'en'), '120+ words')
    assert.equal(
      describeCountRange({ min: null, max: 10 }, 'sentences', 'en'),
      'up to 10 sentences',
    )
    assert.equal(describeCountRange({ min: 1, max: 1 }, 'sentences', 'en'), '1 sentence')
    assert.equal(describeCountRange({ min: null, max: null }, 'words', 'en'), null)
    // 日本語は AI のプロンプト用の describeRange と同じ
    assert.equal(describeCountRange({ min: 120, max: null }, 'words', 'ja'), '120 語以上')
  })

  it('summarizeStage', () => {
    assert.equal(summarizeStage('draft', '', 'en'), 'Not started')
    assert.equal(summarizeStage('assignment', '# T\n\n- 語数:\n- 文数:\n', 'en'), 'No limit')
    assert.equal(summarizeStage('outline', '意見\n  理由1\n    例\n  理由2\n', 'en'), '2 reasons')
    assert.equal(summarizeStage('outline', '意見だけ\n', 'en'), '1 item')
    assert.equal(summarizeStage('draft', 'Hello.', 'en'), '1 word')
  })
})
