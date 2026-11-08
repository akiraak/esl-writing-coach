import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countSentences, countWords, hasJapanese } from '../src/shared/counting.js'

describe('countWords', () => {
  it('英単語を数える。短縮形・ハイフン・小数は 1 語', () => {
    assert.equal(countWords(''), 0)
    assert.equal(countWords('In my opinion, students should not wear uniforms.'), 8)
    assert.equal(countWords("I don't think it's well-known."), 5)
    assert.equal(countWords('It costs 3.5 times more.'), 5)
    assert.equal(countWords('First,second'), 2)
    assert.equal(countWords('It costs 50,000 yen.'), 4)
  })
})

describe('countSentences', () => {
  it('句点・感嘆符・疑問符で区切る', () => {
    assert.equal(countSentences(''), 0)
    assert.equal(countSentences('   '), 0)
    assert.equal(countSentences('I agree. Uniforms are useful! Are they cheap?'), 3)
  })

  it('最後に句点の無い文も 1 文', () => {
    assert.equal(countSentences('I agree. Uniforms are'), 2)
  })

  it('引用符・括弧が続いても終わり。連続した記号は 1 つ', () => {
    assert.equal(countSentences('He said "No." Then he left.'), 2)
    assert.equal(countSentences('Really?! I think so (mostly.) Yes.'), 3)
    assert.equal(countSentences('Wait... It is fine.'), 2)
  })

  it('小数と、空白の無い句点は終わりにしない', () => {
    assert.equal(countSentences('It costs 3.5 times more. That is a lot.'), 2)
    assert.equal(countSentences('See example.com for details.'), 1)
  })

  it('敬称は終わりにしない', () => {
    assert.equal(countSentences('Mr. Smith and Dr. Brown agree. They are teachers.'), 2)
  })

  it('etc. や e.g. は次が大文字か本文の終わりのときだけ終わり', () => {
    assert.equal(countSentences('We need pens, paper, etc. and more.'), 1)
    assert.equal(countSentences('We need pens, paper, etc. Students buy them.'), 2)
    assert.equal(countSentences('Some items, e.g. bags, are costly.'), 1)
    assert.equal(countSentences('We need pens, paper, etc.'), 1)
  })

  it('記号だけの切れ端は数えない', () => {
    assert.equal(countSentences('I agree. . !'), 1)
  })
})

describe('hasJapanese', () => {
  it('ひらがな・カタカナ・漢字があれば true', () => {
    assert.equal(hasJapanese('I think uniforms are good.'), false)
    assert.equal(hasJapanese('I think 制服 is good.'), true)
    assert.equal(hasJapanese('I like ラーメン.'), true)
    assert.equal(hasJapanese('とても good.'), true)
    assert.equal(hasJapanese('Café naïve — “quotes”'), false)
  })
})
