import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import {
  buildUserPrompt,
  dropUnquotable,
  OUTPUT_SCHEMA,
  parseScoringOutput,
  SYSTEM_PROMPT,
} from '../src/ai/scoring.js'
import { parseAssignment } from '../src/shared/assignment.js'
import { CRITERIA, parseFeedback, totalOf } from '../src/shared/feedback.js'

const output = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    scores: {
      structure: { score: 24, comment: '構成はよい' },
      content: { score: 20, comment: '' },
      grammar: { score: 15, comment: '' },
      vocabulary: { score: 11, comment: '' },
      requirements: { score: 8, comment: '' },
    },
    strengths: ['意見がはっきりしている'],
    findings: [
      {
        criterion: 'grammar',
        quote: 'he go',
        hint: '三人称単数の動詞の形を確かめよう',
        fix: ' he goes ',
      },
    ],
    ...overrides,
  })

describe('プロンプト', () => {
  it('システムプロンプトに 5 つの観点と満点、修正例の英文の指示、日本語の指摘', () => {
    for (const c of CRITERIA)
      assert.ok(SYSTEM_PROMPT.includes(`${c.label}（${c.key}）${c.max} 点`), c.key)
    assert.ok(SYSTEM_PROMPT.includes('指摘の fix には、**修正例の英文**を書きます'))
    assert.ok(!SYSTEM_PROMPT.includes('正しい言い方そのものは、どこにも書かないでください'))
    assert.ok(SYSTEM_PROMPT.includes('段落全体を書き直した文は、どこにも書かないでください'))
    assert.deepEqual(OUTPUT_SCHEMA.properties.findings.items.required, [
      'criterion',
      'quote',
      'hint',
      'fix',
    ])
    assert.ok(SYSTEM_PROMPT.includes('日本語が混じっていれば'))
    assert.equal(
      CRITERIA.reduce((sum, c) => sum + c.max, 0),
      100,
    )
  })

  it('ユーザーのメッセージに課題・指定・条件・アプリが数えた値・本文', () => {
    const assignment = parseAssignment(
      '# Should students wear uniforms?\n\n- 語数: 120-150\n- 文数: 8-\n\n## 条件\n\n理由を 3 つ挙げる。\n',
    )
    const prompt = buildUserPrompt({ assignment, draft: 'I agree. Uniforms are good.\n' })
    assert.ok(prompt.includes('テーマ: Should students wear uniforms?'))
    assert.ok(prompt.includes('語数の指定: 120–150 語'))
    assert.ok(prompt.includes('文数の指定: 8 文以上'))
    assert.ok(prompt.includes('理由を 3 つ挙げる。'))
    assert.ok(prompt.includes('- 語数: 5'))
    assert.ok(prompt.includes('- 文数: 2'))
    assert.ok(prompt.includes('<paragraph>\nI agree. Uniforms are good.\n</paragraph>'))
  })

  it('指定・条件が無ければそう書く', () => {
    const prompt = buildUserPrompt({ assignment: parseAssignment(''), draft: 'x' })
    assert.ok(prompt.includes('テーマ: （未入力）'))
    assert.ok(prompt.includes('語数の指定: 指定なし'))
    assert.ok(prompt.includes('構成や表現の条件: （なし）'))
  })

  it('出力のスキーマは観点を全部必須にしている', () => {
    assert.deepEqual(
      OUTPUT_SCHEMA.properties.scores.required,
      CRITERIA.map((c) => c.key),
    )
  })
})

describe('parseScoringOutput', () => {
  it('読める', () => {
    const out = parseScoringOutput(output())
    assert.equal(out.scores.structure.score, 24)
    assert.equal(totalOf(out.scores), 78)
    assert.deepEqual(out.strengths, ['意見がはっきりしている'])
    assert.equal(out.findings[0]?.criterion, 'grammar')
    assert.equal(out.findings[0]?.fix, 'he goes')
  })

  it('点数は 0〜満点の整数に収める', () => {
    const out = parseScoringOutput(
      output({
        scores: {
          structure: { score: 45, comment: '' },
          content: { score: -3, comment: '' },
          grammar: { score: 12.6, comment: '' },
          vocabulary: { score: 15, comment: '' },
          requirements: { score: 10, comment: '' },
        },
      }),
    )
    assert.deepEqual(
      [out.scores.structure.score, out.scores.content.score, out.scores.grammar.score],
      [30, 0, 13],
    )
  })

  it('観点が欠けている・JSON でないなら AiOutputError', () => {
    assert.throws(() => parseScoringOutput('not json'), AiOutputError)
    assert.throws(
      () => parseScoringOutput(output({ scores: { structure: { score: 1, comment: '' } } })),
      AiOutputError,
    )
  })

  it('知らない観点・空のヒントの指摘は捨て、指摘は 10 個・よかった点は 3 個まで', () => {
    const findings = [
      { criterion: 'unknown', quote: '', hint: 'x' },
      { criterion: 'grammar', quote: '', hint: '  ' },
      ...Array.from({ length: 12 }, (_, i) => ({ criterion: 'content', quote: '', hint: `h${i}` })),
    ]
    const out = parseScoringOutput(output({ findings, strengths: ['a', 'b', 'c', 'd', ''] }))
    assert.equal(out.findings.length, 10)
    assert.equal(out.findings[0]?.hint, 'h0')
    assert.equal(out.findings[0]?.fix, '')
    assert.deepEqual(out.strengths, ['a', 'b', 'c'])
  })
})

describe('parseFeedback（feedback.json）', () => {
  it('読み戻せる。合計は観点の点数から出し直す', () => {
    const out = parseScoringOutput(output())
    const text = JSON.stringify({
      version: 1,
      scoredAt: '2026-11-08T01:00:00Z',
      model: 'claude-opus-5-5',
      draft: 'I agree.',
      total: 999,
      ...out,
    })
    const fb = parseFeedback(text)
    assert.equal(fb?.total, 78)
    assert.equal(fb?.draft, 'I agree.')
    assert.equal(fb?.findings.length, 1)
    assert.equal(fb?.findings[0]?.fix, 'he goes')
    // fix の無い古い結果は空として読む
    const old = JSON.parse(text)
    old.findings = [{ criterion: 'grammar', quote: 'he go', hint: 'h' }]
    assert.equal(parseFeedback(JSON.stringify(old))?.findings[0]?.fix, '')
  })

  it('壊れていれば null', () => {
    assert.equal(parseFeedback('{'), null)
    assert.equal(parseFeedback('{"version":2}'), null)
    assert.equal(parseFeedback(JSON.stringify({ version: 1, scores: {} })), null)
  })
})

describe('dropUnquotable', () => {
  it('本文に無い引用（直した形）は消してヒントと修正例は残す。空白の違いと空の引用はそのまま', () => {
    const draft = 'First, uniforms takes away a chance.\nFinally, uniform are not comfortable.'
    const out = dropUnquotable(
      [
        {
          criterion: 'grammar',
          quote: 'uniforms takes away',
          hint: 'a',
          fix: 'uniforms take away',
        },
        {
          criterion: 'grammar',
          quote: 'Finally, uniforms are not comfortable.',
          hint: 'b',
          fix: 'B',
        },
        { criterion: 'grammar', quote: 'a chance. Finally,  uniform', hint: 'c', fix: '' },
        { criterion: 'content', quote: '', hint: 'd', fix: '' },
      ],
      draft,
    )
    assert.deepEqual(
      out.map((f) => f.quote),
      ['uniforms takes away', '', 'a chance. Finally,  uniform', ''],
    )
    assert.deepEqual(
      out.map((f) => f.hint),
      ['a', 'b', 'c', 'd'],
    )
    assert.deepEqual(
      out.map((f) => f.fix),
      ['uniforms take away', 'B', '', ''],
    )
  })
})
