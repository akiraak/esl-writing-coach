import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countReasons, outlineRoles } from '../src/shared/outline-roles.js'

const brief = (text: string) =>
  outlineRoles(text).map((i) => `${i.role}${i.number ?? ''}:${i.level}:${i.label}`)

describe('outlineRoles', () => {
  it('中心 = topic、子 = reason（番号つき）、孫より深いもの = example', () => {
    const text = [
      '制服は義務にすべきではない',
      '\t個性を出せない',
      '\t\t自分で服を選ぶ',
      '\t\t\tさらに細かい',
      '\tお金がかかる',
    ].join('\n')
    assert.deepEqual(brief(text), [
      'topic:0:制服は義務にすべきではない',
      'reason1:1:個性を出せない',
      'example:2:自分で服を選ぶ',
      'example:3:さらに細かい',
      'reason2:1:お金がかかる',
    ])
  })

  it('最後の子が「結論」「まとめ」「Conclusion」で始まれば結論（子孫も）', () => {
    for (const head of [
      '結論: 服は自分で選ぶ',
      'まとめ',
      'Conclusion - choose freely',
      'conclusion',
    ]) {
      const items = outlineRoles(`意見\n  理由\n  ${head}\n    言い換え`)
      assert.deepEqual(
        items.map((i) => [i.role, i.level]),
        [
          ['topic', 0],
          ['reason', 1],
          ['conclusion', 0],
          ['conclusion', 1],
        ],
        head,
      )
    }
  })

  it('最後でない「結論」は理由のまま', () => {
    assert.deepEqual(
      outlineRoles('意見\n  結論\n  理由').map((i) => i.role),
      ['topic', 'reason', 'reason'],
    )
  })

  it('字下げ 0 の行が 2 つ以上なら、それぞれ topic。最後の行が結論なら結論', () => {
    assert.deepEqual(brief('意見A\n  理由A\n意見B\n  理由B\nまとめ'), [
      'topic:0:意見A',
      'reason1:1:理由A',
      'topic:0:意見B',
      'reason2:1:理由B',
      'conclusion:0:まとめ',
    ])
  })

  it('空・空行だけなら何も無い', () => {
    assert.deepEqual(outlineRoles(''), [])
    assert.deepEqual(outlineRoles('\n \n'), [])
  })

  it('本文の行を持つ', () => {
    assert.deepEqual(
      outlineRoles('意見\n\n  理由').map((i) => i.line),
      [0, 2],
    )
  })
})

describe('countReasons', () => {
  it('理由の数（結論は数えない）', () => {
    assert.equal(countReasons('意見\n  a\n  b\n  c\n  結論'), 3)
    assert.equal(countReasons('意見'), 0)
  })
})
