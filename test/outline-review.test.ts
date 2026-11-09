import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import {
  buildOutlineReviewPrompt,
  OUTLINE_SYSTEM,
  parseOutlineReview,
} from '../src/ai/outline-review.js'

const outline = '制服は義務にすべきではない\n\t個性を出せない\n\t\t自分で服を選ぶ\n\tお金がかかる'

describe('アウトラインの指摘', () => {
  it('プロンプト: テーマ・条件・アウトライン。システムは日本語・書き換え案を出さない', () => {
    const prompt = buildOutlineReviewPrompt({
      theme: ' Uniforms? ',
      conditions: '',
      outline: `${outline}\n\n`,
    })
    assert.ok(prompt.includes('## テーマ\nUniforms?'))
    assert.ok(prompt.includes('## 課題の条件\n（なし）'))
    assert.ok(prompt.includes(`<outline>\n${outline}\n</outline>`))
    assert.ok(OUTLINE_SYSTEM.includes('すべて日本語で'))
    assert.ok(
      OUTLINE_SYSTEM.includes('直した項目・書き換えた案・足すべき項目の文そのものは書きません'),
    )
  })

  it('出力: アウトラインに無い引用は消し、空のヒントは捨て、6 つまで', () => {
    const findings = [
      { quote: 'お金がかかる', hint: '例が無い' },
      { quote: 'お金が高い', hint: 'アウトラインに無い引用' },
      { quote: '', hint: '  ' },
      ...Array.from({ length: 8 }, (_, i) => ({ quote: '', hint: `h${i}` })),
    ]
    const review = parseOutlineReview(JSON.stringify({ summary: ' よい ', findings }), outline)
    assert.equal(review.summary, 'よい')
    assert.equal(review.findings.length, 6)
    assert.deepEqual(review.findings[0], { quote: 'お金がかかる', hint: '例が無い' })
    assert.deepEqual(review.findings[1], { quote: '', hint: 'アウトラインに無い引用' })
  })

  it('出力: 壊れていれば AiOutputError', () => {
    assert.throws(() => parseOutlineReview('{', outline), AiOutputError)
    assert.throws(() => parseOutlineReview('[]', outline), AiOutputError)
  })
})
