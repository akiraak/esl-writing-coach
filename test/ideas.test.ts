import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import {
  buildIdeasPrompt,
  buildThemesPrompt,
  IDEAS_SYSTEM,
  parseIdeas,
  parseThemes,
  stripOrdinal,
  THEMES_SYSTEM,
} from '../src/ai/ideas.js'
import { isIdeasStale, isOutlineReviewStale } from '../src/shared/ideas.js'

describe('テーマの候補', () => {
  it('プロンプト: 分野があれば入れ、無ければ指定なし。システムは 5 つ・賛否を取れる問い', () => {
    assert.ok(buildThemesPrompt('  部活  ').includes('<hint>\n部活\n</hint>'))
    assert.ok(buildThemesPrompt('').includes('分野の指定なし'))
    assert.ok(THEMES_SYSTEM.includes('候補は 5 つ'))
    assert.ok(THEMES_SYSTEM.includes('賛成・反対の立場を取れる'))
  })

  it('出力: 英語が空のものは捨て、5 つまで。無ければ AiOutputError', () => {
    const themes = parseThemes(
      JSON.stringify({
        themes: [
          { en: ' Should students wear uniforms? ', ja: '制服を着るべきか' },
          { en: '', ja: '空' },
          ...Array.from({ length: 6 }, (_, i) => ({ en: `Q${i}?`, ja: `問${i}` })),
        ],
      }),
    )
    assert.equal(themes.length, 5)
    assert.deepEqual(themes[0], { en: 'Should students wear uniforms?', ja: '制服を着るべきか' })
    assert.throws(() => parseThemes('{"themes":[]}'), AiOutputError)
    assert.throws(() => parseThemes('nope'), AiOutputError)
  })
})

describe('理由・例の候補', () => {
  const side = (n: number) => ({
    opinion: '意見',
    reasons: Array.from({ length: n }, (_, i) => ({
      reason: `理由${i}`,
      examples: ['例a', ' ', '例b', '例c'],
    })),
  })

  it('プロンプト: テーマと条件。システムは日本語だけ・英文を出さない', () => {
    const prompt = buildIdeasPrompt({ theme: ' Should we? ', conditions: '' })
    assert.ok(prompt.includes('## テーマ\nShould we?'))
    assert.ok(prompt.includes('## 課題の条件\n（なし）'))
    assert.ok(buildIdeasPrompt({ theme: 'x', conditions: '理由を 3 つ' }).includes('理由を 3 つ'))
    assert.ok(IDEAS_SYSTEM.includes('すべて日本語で'))
    assert.ok(IDEAS_SYSTEM.includes('英語の文'))
  })

  it('出力: 賛成・反対の順。理由は 3 つ、例は空を捨てて 2 つまで', () => {
    const ideas = parseIdeas(JSON.stringify({ for: side(4), against: side(2) }))
    assert.deepEqual(
      ideas.sides.map((s) => [s.stance, s.reasons.length]),
      [
        ['for', 3],
        ['against', 2],
      ],
    )
    assert.deepEqual(ideas.sides[0]?.reasons[0]?.examples, ['例a', '例b'])
  })

  it('出力: 片側が無い・理由が無いなら AiOutputError', () => {
    assert.throws(() => parseIdeas(JSON.stringify({ for: side(1) })), AiOutputError)
    assert.throws(
      () => parseIdeas(JSON.stringify({ for: side(1), against: side(0) })),
      AiOutputError,
    )
  })
})

describe('stripOrdinal', () => {
  it('理由の頭の順番の言葉を落とす', () => {
    assert.equal(stripOrdinal('First：人間関係が広がる'), '人間関係が広がる')
    assert.equal(stripOrdinal('Second: 体力がつく'), '体力がつく')
    assert.equal(stripOrdinal('finally、時間が減る'), '時間が減る')
    assert.equal(stripOrdinal('1つ目：お金がかかる'), 'お金がかかる')
    assert.equal(stripOrdinal('２. 疲れる'), '疲れる')
    assert.equal(stripOrdinal('ファーストフードが増える'), 'ファーストフードが増える')
    assert.equal(stripOrdinal('Firstly the cost'), 'Firstly the cost')
  })
})

describe('保存した AI案の古さ', () => {
  const at = '2026-11-11T00:00:00.000Z'
  it('理由・例の候補: テーマ（前後の空白は見ない）か条件が変われば古い', () => {
    const saved = { theme: 'Uniforms', conditions: 'C', ideas: { sides: [] }, createdAt: at }
    assert.equal(isIdeasStale(saved, ' Uniforms ', 'C'), false)
    assert.equal(isIdeasStale(saved, 'Phones', 'C'), true)
    assert.equal(isIdeasStale(saved, 'Uniforms', 'C2'), true)
  })

  it('アウトラインの指摘: アウトライン・テーマ・条件のどれかが変われば古い', () => {
    const review = { summary: '', findings: [] }
    const saved = { theme: 'T', conditions: 'C', outline: '意見', review, createdAt: at }
    assert.equal(isOutlineReviewStale(saved, 'T', 'C', '意見'), false)
    assert.equal(isOutlineReviewStale(saved, 'T', 'C', '意見\n\t理由'), true)
    assert.equal(isOutlineReviewStale(saved, 'T2', 'C', '意見'), true)
  })
})
