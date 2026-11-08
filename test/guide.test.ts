import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countSentences, countWords, hasJapanese } from '../src/shared/counting.js'
import { FLOW, MODEL, PHRASES, STRUCTURE } from '../src/shared/guide.js'
import { outlineRoles } from '../src/shared/outline-roles.js'

/** 学習ガイドの中身の食い違いを防ぐ。 */

describe('学習ガイドの中身', () => {
  it('構成の解説は 4 役割を 1 つずつ、型の順に', () => {
    assert.deepEqual(
      STRUCTURE.map((p) => p.role),
      ['topic', 'reason', 'example', 'conclusion'],
    )
  })

  it('モデル文の役割の並びは並びの図と同じ（Topic → Reason・Example ×3 → Conclusion）', () => {
    assert.deepEqual(
      MODEL.sentences.map((s) => s.role),
      FLOW.map((f) => f.role),
    )
  })

  it('モデル文のアウトラインの役割は、文の役割と同じ並び', () => {
    assert.deepEqual(
      outlineRoles(MODEL.outline).map((i) => i.role),
      MODEL.sentences.map((s) => s.role),
    )
  })

  it('モデル文の各文は 1 文と数えられ、全体は 80〜150 語・日本語なし', () => {
    for (const s of MODEL.sentences) assert.equal(countSentences(s.text), 1, s.text)
    const text = MODEL.sentences.map((s) => s.text).join(' ')
    assert.equal(countSentences(text), MODEL.sentences.length)
    const words = countWords(text)
    assert.ok(words >= 80 && words <= 150, `${words} 語`)
    assert.equal(hasJapanese(text), false)
  })

  it('表現集の表現は重複していない', () => {
    const all = PHRASES.flatMap((g) => g.phrases.map((p) => p.en.toLowerCase()))
    assert.equal(new Set(all).size, all.length)
    for (const g of PHRASES) assert.ok(g.phrases.length > 0, g.title)
  })
})
