import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkOutline } from '../src/shared/outline-checks.js'

const oks = (text: string) => checkOutline(text).map((c) => c.ok)

describe('checkOutline', () => {
  it('型どおりなら全部 ✓', () => {
    const text = '意見\n\t理由1\n\t\t例1\n\t理由2\n\t\t例2\n\t結論: まとめ'
    assert.deepEqual(oks(text), [true, true, true, true])
  })

  it('空なら全部 !（意見を書くよう促す）', () => {
    const checks = checkOutline('')
    assert.deepEqual(
      checks.map((c) => c.ok),
      [false, false, false, false],
    )
    assert.equal(checks[0]?.detail, '中心に意見を書こう。')
  })

  it('理由が 1 つ・4 つなら理由の数が !', () => {
    assert.equal(checkOutline('意見\n\t理由\n\t\t例')[1]?.ok, false)
    assert.equal(checkOutline('意見\n\ta\n\t\tx\n\tb\n\t\tx\n\tc\n\t\tx\n\td\n\t\tx')[1]?.ok, false)
    assert.match(checkOutline('意見\n\ta\n\tb\n\tc\n\td')[1]?.detail ?? '', /4 つ/)
  })

  it('例の無い理由の名前を出す（結論の前の理由も）', () => {
    const checks = checkOutline('意見\n\t理由A\n\t\t例\n\t理由B\n\t理由C\n\t結論')
    assert.equal(checks[2]?.ok, false)
    assert.equal(checks[2]?.detail, '例・詳細の無い理由: 理由B / 理由C')
  })

  it('意見が複数・結論が無いとき', () => {
    const checks = checkOutline('意見A\n\t理由\n意見B')
    assert.equal(checks[0]?.ok, false)
    assert.match(checks[0]?.detail ?? '', /2 つ/)
    assert.equal(checks[3]?.ok, false)
  })
})
