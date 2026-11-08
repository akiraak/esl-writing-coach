import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type Assignment,
  emptyAssignment,
  formatRange,
  isReversed,
  parseAssignment,
  parseRange,
  serializeAssignment,
} from '../src/shared/assignment.js'

const SAMPLE = `# Should students wear school uniforms?

- 語数: 120-150
- 文数: 8-10

## 条件

理由を 3 つ挙げ、First / Second / Finally を使う。
結論で topic sentence を別の言葉で言い換える。
`

const SAMPLE_VALUE: Assignment = {
  theme: 'Should students wear school uniforms?',
  words: { min: 120, max: 150 },
  sentences: { min: 8, max: 10 },
  conditions:
    '理由を 3 つ挙げ、First / Second / Finally を使う。\n結論で topic sentence を別の言葉で言い換える。',
}

describe('parseRange / formatRange', () => {
  it('範囲・以上・以下・ちょうど・空を読む', () => {
    assert.deepEqual(parseRange('120-150'), { min: 120, max: 150 })
    assert.deepEqual(parseRange('120-'), { min: 120, max: null })
    assert.deepEqual(parseRange('-150'), { min: null, max: 150 })
    assert.deepEqual(parseRange('120'), { min: 120, max: 120 })
    assert.deepEqual(parseRange(''), { min: null, max: null })
    assert.deepEqual(parseRange('  '), { min: null, max: null })
  })

  it('全角・波ダッシュ・空白・単位が付いていても読む', () => {
    assert.deepEqual(parseRange('１２０〜１５０'), { min: 120, max: 150 })
    assert.deepEqual(parseRange('120 ~ 150 語'), { min: 120, max: 150 })
    assert.deepEqual(parseRange('8–10 sentences'), { min: 8, max: 10 })
  })

  it('読めなければ null', () => {
    assert.equal(parseRange('約150'), null)
    assert.equal(parseRange('120-150-200'), null)
  })

  it('formatRange は parseRange と往復する', () => {
    for (const text of ['120-150', '120-', '-150', '120', '']) {
      const range = parseRange(text)
      assert.ok(range !== null)
      assert.equal(formatRange(range), text)
    }
  })

  it('isReversed は下限 > 上限だけ', () => {
    assert.equal(isReversed({ min: 150, max: 120 }), true)
    assert.equal(isReversed({ min: 120, max: 150 }), false)
    assert.equal(isReversed({ min: 150, max: null }), false)
  })
})

describe('parseAssignment', () => {
  it('決めた形を読む', () => {
    assert.deepEqual(parseAssignment(SAMPLE), SAMPLE_VALUE)
  })

  it('CRLF でも読む', () => {
    assert.deepEqual(parseAssignment(SAMPLE.replaceAll('\n', '\r\n')), SAMPLE_VALUE)
  })

  it('空・指定なし・テーマだけ', () => {
    assert.deepEqual(parseAssignment(''), emptyAssignment())
    assert.deepEqual(parseAssignment('# Homework\n'), emptyAssignment('Homework'))
    assert.deepEqual(parseAssignment('#\n\n- 語数:\n- 文数:\n\n## 条件\n'), emptyAssignment())
  })

  it('条件の中の見出し・箇条書き・空行はそのまま残す', () => {
    const text = '# A\n\n## 条件\n\n- First を使う\n\n## メモ\n語数: 気にしない\n'
    assert.equal(parseAssignment(text).conditions, '- First を使う\n\n## メモ\n語数: 気にしない')
  })

  it('手で崩しても内容を消さない（読めない行は条件の先頭へ）', () => {
    const text = '# A\n先生のメモ: 来週提出\n- 語数: 約150\n\n## 条件\n\n理由は 3 つ\n'
    const parsed = parseAssignment(text)
    assert.equal(parsed.theme, 'A')
    assert.deepEqual(parsed.words, { min: null, max: null })
    assert.equal(parsed.conditions, '先生のメモ: 来週提出\n- 語数: 約150\n\n理由は 3 つ')
  })

  it('形のないただのメモも、全部が条件に入る', () => {
    assert.equal(
      parseAssignment('制服について\n120語くらい').conditions,
      '制服について\n120語くらい',
    )
  })
})

describe('serializeAssignment', () => {
  it('決めた形で書き出す', () => {
    assert.equal(serializeAssignment(SAMPLE_VALUE), SAMPLE)
  })

  it('空でも骨組みを書く（読み直すと空に戻る）', () => {
    const text = serializeAssignment(emptyAssignment())
    assert.equal(text, '#\n\n- 語数:\n- 文数:\n\n## 条件\n')
    assert.deepEqual(parseAssignment(text), emptyAssignment())
  })

  it('テーマの改行は空白にする（1 行目に収める）', () => {
    const text = serializeAssignment({ ...emptyAssignment(), theme: 'Is homework\nnecessary?' })
    assert.ok(text.startsWith('# Is homework necessary?\n'))
  })

  it('読み → 書き → 読みで同じ値に戻る', () => {
    const cases: Assignment[] = [
      SAMPLE_VALUE,
      {
        theme: 'B',
        words: { min: 120, max: null },
        sentences: { min: null, max: 10 },
        conditions: '',
      },
      {
        theme: '',
        words: { min: 100, max: 100 },
        sentences: { min: null, max: null },
        conditions: '## 見出し\n\n- a',
      },
    ]
    for (const value of cases) assert.deepEqual(parseAssignment(serializeAssignment(value)), value)
  })

  it('崩れた形を読み直して書くと、決めた形に直る（内容は残る）', () => {
    const fixed = serializeAssignment(parseAssignment('先生のメモ\n# Theme\n- 語数: 100-120\n'))
    assert.equal(fixed, '# Theme\n\n- 語数: 100-120\n- 文数:\n\n## 条件\n\n先生のメモ\n')
  })
})
