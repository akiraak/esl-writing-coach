import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import {
  buildIdeasPrompt,
  buildThemesPrompt,
  IDEAS_SYSTEM,
  parseIdeas,
  parseThemes,
  THEMES_SYSTEM,
} from '../src/ai/ideas.js'
import { appendToMemo, memoBlock } from '../src/shared/ideas.js'

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

describe('メモへの書き足し', () => {
  const block = memoBlock('for', {
    reason: 'お金の管理を学べる',
    examples: ['自分で稼ぐ', '貯金する'],
  })

  it('理由と例を立場つきで', () => {
    assert.equal(block, '理由（賛成）: お金の管理を学べる\n  例: 自分で稼ぐ\n  例: 貯金する')
    assert.equal(
      memoBlock('against', { reason: '勉強の時間が減る', examples: [] }),
      '理由（反対）: 勉強の時間が減る',
    )
  })

  it('空のメモにはそのまま、空でなければ空行を 1 つ挟む', () => {
    assert.equal(appendToMemo('', block), `${block}\n`)
    assert.equal(appendToMemo('意見: 賛成', block), `意見: 賛成\n\n${block}\n`)
    assert.equal(appendToMemo('意見: 賛成\n\n\n', block), `意見: 賛成\n\n${block}\n`)
  })
})
