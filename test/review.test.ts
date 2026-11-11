import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Feedback, Finding } from '../src/shared/feedback.js'
import { type ReviewEntry, summarizeReview } from '../src/shared/review.js'

function feedback(
  scoredAt: string,
  s: [number, number, number, number, number],
  findings: Finding[] = [],
): Feedback {
  const [structure, content, grammar, vocabulary, requirements] = s
  const scores = {
    structure: { score: structure, comment: '' },
    content: { score: content, comment: '' },
    grammar: { score: grammar, comment: '' },
    vocabulary: { score: vocabulary, comment: '' },
    requirements: { score: requirements, comment: '' },
  }
  return {
    version: 1,
    scoredAt,
    model: 'm',
    draft: '',
    total: s.reduce((a, b) => a + b, 0),
    scores,
    strengths: [],
    findings,
  }
}

const entry = (id: string, fb: Feedback): ReviewEntry => ({ id, theme: `T-${id}`, feedback: fb })

describe('summarizeReview', () => {
  it('採点が無ければ数 0・平均なし', () => {
    const r = summarizeReview([])
    assert.equal(r.count, 0)
    assert.equal(r.averageTotal, null)
    assert.equal(r.weakest, null)
    assert.equal(r.criteria.length, 5)
  })

  it('平均・割合・いちばん低い観点（満点に対する割合で比べる）', () => {
    const r = summarizeReview([
      entry('a', feedback('2026-11-01T00:00:00Z', [24, 20, 10, 12, 8])),
      entry('b', feedback('2026-11-05T00:00:00Z', [27, 21, 12, 12, 9])),
    ])
    assert.equal(r.count, 2)
    assert.equal(r.averageTotal, 77.5)
    const grammar = r.criteria.find((c) => c.key === 'grammar')
    assert.deepEqual([grammar?.average, grammar?.percent], [11, 55])
    assert.equal(r.weakest, 'grammar')
  })

  it('推移は採点した日の古い順', () => {
    const r = summarizeReview([
      entry('new', feedback('2026-11-08T00:00:00Z', [1, 1, 1, 1, 1])),
      entry('old', feedback('2026-11-01T00:00:00Z', [1, 1, 1, 1, 1])),
    ])
    assert.deepEqual(
      r.timeline.map((e) => e.id),
      ['old', 'new'],
    )
  })

  it('指摘は観点ごと（新しい採点のものから）、観点の並びは指摘の多い順', () => {
    const g = (hint: string): Finding => ({ criterion: 'grammar', quote: '', hint })
    const r = summarizeReview([
      entry(
        'old',
        feedback(
          '2026-11-01T00:00:00Z',
          [1, 1, 1, 1, 1],
          [g('古い'), { criterion: 'content', quote: 'q', hint: '内容' }],
        ),
      ),
      entry('new', feedback('2026-11-08T00:00:00Z', [1, 1, 1, 1, 1], [g('新しい')])),
    ])
    assert.deepEqual(
      r.findings.map((f) => [f.key, f.items.length]),
      [
        ['grammar', 2],
        ['content', 1],
        ['structure', 0],
        ['vocabulary', 0],
        ['requirements', 0],
      ],
    )
    assert.deepEqual(
      r.findings[0]?.items.map((i) => [i.hint, i.theme]),
      [
        ['新しい', 'T-new'],
        ['古い', 'T-old'],
      ],
    )
  })
})
