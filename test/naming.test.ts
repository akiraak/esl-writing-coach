import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dateOfParagraphId,
  FALLBACK_SLUG,
  isDateString,
  isParagraphId,
  paragraphIdCandidate,
  SLUG_MAX_LENGTH,
  slugFromTheme,
} from '../src/paragraphs/naming.js'

describe('slugFromTheme', () => {
  it('小文字にして、英数字以外の並びを - 1 つにする', () => {
    assert.equal(
      slugFromTheme('Should students wear school uniforms?'),
      'should-students-wear-school-uniforms',
    )
    assert.equal(slugFromTheme('  Is homework   necessary?! '), 'is-homework-necessary')
  })

  it('アクセント付きの字は素の字に直す', () => {
    assert.equal(slugFromTheme('Café culture'), 'cafe-culture')
  })

  it('英数字が無ければ paragraph（日本語だけのテーマ）', () => {
    assert.equal(slugFromTheme('制服は必要か'), FALLBACK_SLUG)
    assert.equal(slugFromTheme(''), FALLBACK_SLUG)
  })

  it('日本語と英語が混ざっていれば英語だけ残す', () => {
    assert.equal(slugFromTheme('制服 school uniforms'), 'school-uniforms')
  })

  it(`${SLUG_MAX_LENGTH} 文字までを単語の切れ目で切る`, () => {
    const slug = slugFromTheme(
      'Is it better to live in a city or in the countryside when you are old?',
    )
    assert.ok(slug.length <= SLUG_MAX_LENGTH)
    assert.equal(slug, 'is-it-better-to-live-in-a-city-or-in-the')
    assert.ok(!slug.endsWith('-'))
  })

  it('1 語目から長すぎるときだけ語の途中で切る', () => {
    assert.equal(slugFromTheme('a'.repeat(60)), 'a'.repeat(SLUG_MAX_LENGTH))
  })
})

describe('paragraphIdCandidate', () => {
  it('作成日 + スラッグ。2 回目以降は番号を付ける', () => {
    assert.equal(
      paragraphIdCandidate('2026-11-08', 'School uniforms'),
      '2026-11-08-school-uniforms',
    )
    assert.equal(
      paragraphIdCandidate('2026-11-08', 'School uniforms', 2),
      '2026-11-08-school-uniforms-2',
    )
  })

  it('作られた id は isParagraphId を通る', () => {
    for (const theme of ['Should students wear school uniforms?', '制服', 'x'.repeat(80)]) {
      assert.equal(isParagraphId(paragraphIdCandidate('2026-11-08', theme, 3)), true)
    }
  })

  it('日付・回数が不正なら RangeError', () => {
    assert.throws(() => paragraphIdCandidate('2026/11/08', 'a'), RangeError)
    assert.throws(() => paragraphIdCandidate('2026-02-30', 'a'), RangeError)
    assert.throws(() => paragraphIdCandidate('2026-11-08', 'a', 0), RangeError)
  })
})

describe('isParagraphId', () => {
  it('日付 + 小文字の英数字とハイフンだけを受け付ける', () => {
    assert.equal(isParagraphId('2026-11-08-school-uniforms'), true)
    assert.equal(isParagraphId('2026-11-08-paragraph-2'), true)
  })

  it('パスを抜け出す形・大文字・空のスラッグ・実在しない日付は断る', () => {
    for (const bad of [
      '2026-11-08-../x',
      '2026-11-08-a/b',
      '2026-11-08-a\\b',
      '../2026-11-08-a',
      '2026-11-08-School',
      '2026-11-08-',
      '2026-11-08',
      '2026-11-08-a--b',
      '2026-11-08-a-',
      '2026-02-30-a',
      '2026-13-01-a',
      '',
    ]) {
      assert.equal(isParagraphId(bad), false, bad)
    }
  })

  it('dateOfParagraphId は先頭の日付を返す（形が違えば null）', () => {
    assert.equal(dateOfParagraphId('2026-11-08-a'), '2026-11-08')
    assert.equal(dateOfParagraphId('notes'), null)
  })

  it('isDateString は実在する日付だけ', () => {
    assert.equal(isDateString('2024-02-29'), true)
    assert.equal(isDateString('2026-02-29'), false)
  })
})
