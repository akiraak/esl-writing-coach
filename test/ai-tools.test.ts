import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_TOOLS, aiTabsFor, aiToolsFor, stepNumber } from '../src/shared/ai-tools.js'
import { STAGES } from '../src/shared/types.js'

describe('aiToolsFor', () => {
  it('課題はテーマの候補 → 理由・例、アウトラインは指摘 → 理由・例、下書きは AI に質問 → 日本語訳 → 採点', () => {
    assert.deepEqual(aiToolsFor('assignment').current, ['themes', 'ideas'])
    assert.deepEqual(aiToolsFor('outline').current, ['outline', 'ideas'])
    assert.deepEqual(aiToolsFor('draft').current, ['chat', 'translate', 'score'])
  })

  it('ほかの段階の機能は AI_TOOLS の順で下に回す', () => {
    assert.deepEqual(aiToolsFor('assignment').others, ['outline', 'chat', 'translate', 'score'])
    assert.deepEqual(aiToolsFor('outline').others, ['themes', 'chat', 'translate', 'score'])
    assert.deepEqual(aiToolsFor('draft').others, ['themes', 'ideas', 'outline'])
  })

  it('どの段階でも、全部の機能がどちらか一方に 1 回だけ入る', () => {
    for (const stage of STAGES) {
      const { current, others } = aiToolsFor(stage)
      assert.deepEqual([...current, ...others].sort(), [...AI_TOOLS].sort(), stage)
    }
  })
})

describe('aiTabsFor', () => {
  it('タブに分けるのは下書きだけ（AI / 翻訳 / 採点）', () => {
    assert.equal(aiTabsFor('assignment'), null)
    assert.equal(aiTabsFor('outline'), null)
    assert.deepEqual(
      aiTabsFor('draft')?.map((t) => [t.label, t.tools]),
      [
        ['AI', ['chat']],
        ['翻訳', ['translate']],
        ['採点', ['score']],
      ],
    )
  })

  it('上に出す機能は、どれかのタブに 1 回だけ入る', () => {
    assert.deepEqual(
      aiTabsFor('draft')?.flatMap((t) => t.tools),
      aiToolsFor('draft').current,
    )
  })
})

describe('stepNumber', () => {
  it('課題 = 1、アウトライン = 2、下書き = 3', () => {
    assert.deepEqual(STAGES.map(stepNumber), [1, 2, 3])
  })
})
