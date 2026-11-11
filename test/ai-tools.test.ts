import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_TOOLS, aiToolsFor, stepNumber } from '../src/shared/ai-tools.js'
import { STAGES } from '../src/shared/types.js'

describe('aiToolsFor', () => {
  it('課題はテーマの候補 → 理由・例、アウトラインは指摘 → 理由・例、下書きは AI に質問 → 採点', () => {
    assert.deepEqual(aiToolsFor('assignment').current, ['themes', 'ideas'])
    assert.deepEqual(aiToolsFor('outline').current, ['outline', 'ideas'])
    assert.deepEqual(aiToolsFor('draft').current, ['chat', 'score'])
  })

  it('ほかの段階の機能は AI_TOOLS の順で下に回す', () => {
    assert.deepEqual(aiToolsFor('assignment').others, ['outline', 'chat', 'score'])
    assert.deepEqual(aiToolsFor('outline').others, ['themes', 'chat', 'score'])
    assert.deepEqual(aiToolsFor('draft').others, ['themes', 'ideas', 'outline'])
  })

  it('どの段階でも、全部の機能がどちらか一方に 1 回だけ入る', () => {
    for (const stage of STAGES) {
      const { current, others } = aiToolsFor(stage)
      assert.deepEqual([...current, ...others].sort(), [...AI_TOOLS].sort(), stage)
    }
  })
})

describe('stepNumber', () => {
  it('課題 = 1、アウトライン = 2、下書き = 3', () => {
    assert.deepEqual(STAGES.map(stepNumber), [1, 2, 3])
  })
})
