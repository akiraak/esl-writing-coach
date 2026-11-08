import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { phraseToInsert } from '../src/shared/insert.js'

describe('phraseToInsert', () => {
  it('本文の先頭・空白や改行の後なら前に空白を足さない。後ろには足す', () => {
    assert.equal(phraseToInsert('', 0, 0, 'In my opinion,'), 'In my opinion, ')
    assert.equal(phraseToInsert('I agree. ', 9, 9, 'First,'), 'First, ')
    assert.equal(phraseToInsert('I agree.\n', 9, 9, 'First,'), 'First, ')
  })

  it('文字の直後なら前に空白を足す', () => {
    assert.equal(phraseToInsert('I agree.', 8, 8, 'First,'), ' First, ')
  })

  it('後ろが空白なら後ろには足さない', () => {
    assert.equal(phraseToInsert('I agree. it is good.', 9, 9, 'For example,'), 'For example, ')
    assert.equal(phraseToInsert('I agree.  it', 8, 8, 'First,'), ' First,')
  })

  it('選んだ文字を置き換えるときは、選んだ範囲の外を見る', () => {
    // "I agree. Then it is good." の "Then" を置き換える
    assert.equal(phraseToInsert('I agree. Then it is good.', 9, 13, 'Second,'), 'Second,')
  })
})
