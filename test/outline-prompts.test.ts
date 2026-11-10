import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { outlinePrompt } from '../src/shared/outline-prompts.js'

/** 行番号は 0 始まり（空行も数える）。 */
const OUTLINE = [
  '制服は義務にすべきではない', // 0 意見
  '\t個性を出せない', // 1 理由
  '\t\t自分で選ぶと自分らしくいられる', // 2 例
  '\tお金がかかる', // 3 理由（例なし）
  '\t結論: 制服は選べるようにすべき', // 4 結論
  '\t\t自由に選べる学校を', // 5 結論の子
].join('\n')

describe('outlinePrompt', () => {
  it('空のマップはまず中心に意見を書く', () => {
    const p = outlinePrompt('', -1)
    assert.equal(p.role, null)
    assert.match(p.write, /中心/)
    assert.equal(p.next, null)
    assert.equal(outlinePrompt(' \n\n', -1).role, null)
  })

  it('意見: 理由が 2 つ未満なら理由を足す、そろって結論が無ければ結論、あれば答えているかを見直す', () => {
    assert.match(outlinePrompt('制服は不要', 0).next ?? '', /理由を子に足す/)
    assert.match(outlinePrompt('制服は不要\n\t個性', 0).next ?? '', /理由を子に足す/)
    assert.match(outlinePrompt('制服は不要\n\t個性\n\tお金', 0).next ?? '', /結論/)
    const p = outlinePrompt(OUTLINE, 0)
    assert.equal(p.role, 'topic')
    assert.match(p.write, /賛成か反対か/)
    assert.match(p.next ?? '', /はっきり答えている/)
  })

  it('理由: 例が無ければ例を足す、あれば次の理由を兄弟に', () => {
    const withExample = outlinePrompt(OUTLINE, 1)
    assert.equal(withExample.role, 'reason')
    assert.match(withExample.next ?? '', /兄弟/)
    assert.match(outlinePrompt(OUTLINE, 3).next ?? '', /たとえば/)
  })

  it('例・結論（結論の子も結論）', () => {
    const example = outlinePrompt(OUTLINE, 2)
    assert.equal(example.role, 'example')
    assert.match(example.next ?? '', /具体的/)
    assert.equal(outlinePrompt(OUTLINE, 4).role, 'conclusion')
    assert.equal(outlinePrompt(OUTLINE, 5).role, 'conclusion')
    assert.match(outlinePrompt(OUTLINE, 4).write, /言い直す/)
  })

  it('字下げ 0 の行が複数なら、仮の中心で意見を 1 つにまとめるよう促す。それぞれの意見は自分の下の理由だけを数える', () => {
    const text = '意見A\n\t理由1\n\t理由2\n\t結論: A\n意見B\n\t理由3'
    const root = outlinePrompt(text, -1)
    assert.equal(root.role, null)
    assert.match(root.write, /2 つ/)
    assert.match(root.next ?? '', /1 つにまとめ/)
    assert.match(outlinePrompt(text, 0).next ?? '', /はっきり答えている/)
    assert.match(outlinePrompt(text, 4).next ?? '', /理由を子に足す/)
  })

  it('知らない行（消した直後など）は、意見が 1 つならその意見として出す', () => {
    assert.equal(outlinePrompt(OUTLINE, 99).role, 'topic')
    assert.equal(outlinePrompt(OUTLINE, -1).role, 'topic')
  })
})
