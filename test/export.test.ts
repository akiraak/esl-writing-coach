import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exportFileName, plainTextOf } from '../src/shared/export.js'

describe('plainTextOf', () => {
  it('末尾の空白・空行を落として改行 1 つで終える', () => {
    assert.equal(plainTextOf('I agree.'), 'I agree.\n')
    assert.equal(plainTextOf('I agree.  \n\n \n'), 'I agree.\n')
  })

  it('中の改行・先頭の字下げはそのまま', () => {
    assert.equal(plainTextOf('  First line.\n\nSecond line.\n'), '  First line.\n\nSecond line.\n')
  })

  it('空・空白だけなら空文字', () => {
    assert.equal(plainTextOf(''), '')
    assert.equal(plainTextOf(' \n\t\n'), '')
  })
})

describe('exportFileName', () => {
  it('id.txt', () => {
    assert.equal(exportFileName('2026-11-08-school-uniforms'), '2026-11-08-school-uniforms.txt')
  })
})
