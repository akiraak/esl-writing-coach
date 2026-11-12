import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import {
  buildTranslationPrompt,
  parseTranslationOutput,
  parseTranslations,
  TRANSLATION_SCHEMA,
  TRANSLATION_SYSTEM,
} from '../src/ai/translation.js'
import { parseTranslation } from '../src/shared/translation.js'

describe('日本語訳のプロンプト', () => {
  it('直訳に近く、誤りを直してから訳さない', () => {
    assert.ok(TRANSLATION_SYSTEM.includes('**直訳に近い訳**にします'))
    assert.ok(TRANSLATION_SYSTEM.includes('正しい英文に直してから訳さないでください'))
    assert.ok(TRANSLATION_SYSTEM.includes('（意味が取れません）'))
    assert.deepEqual(TRANSLATION_SCHEMA.properties.translations.items.required, ['n', 'ja'])
  })

  it('段落全体と、番号つきの文を渡す', () => {
    const prompt = buildTranslationPrompt({
      title: '',
      draft: ' I agree. It is cheap.\n',
      sentences: ['I agree.', 'It is cheap.'],
    })
    assert.ok(prompt.includes('<paragraph>\nI agree. It is cheap.\n</paragraph>'))
    assert.ok(prompt.includes('<s n="1">I agree.</s>\n<s n="2">It is cheap.</s>'))
  })
})

describe('タイトルの訳', () => {
  const input = { title: 'Cheap Uniforms', draft: 'I agree.', sentences: ['I agree.'] }

  it('タイトルがあれば 1 番の文として渡し（kind="title"）、訳はタイトルと文に分けて返す', () => {
    assert.ok(
      buildTranslationPrompt(input).includes(
        '<s n="1" kind="title">Cheap Uniforms</s>\n<s n="2">I agree.</s>',
      ),
    )
    const raw = JSON.stringify({
      translations: [
        { n: 1, ja: '安い制服' },
        { n: 2, ja: '私は賛成する。' },
      ],
    })
    assert.deepEqual(parseTranslationOutput(raw, input), {
      title: '安い制服',
      sentences: ['私は賛成する。'],
    })
    assert.deepEqual(parseTranslationOutput(raw, { ...input, title: '', sentences: ['a', 'b'] }), {
      title: '',
      sentences: ['安い制服', '私は賛成する。'],
    })
  })
})

describe('parseTranslations', () => {
  const json = (translations: unknown) => JSON.stringify({ translations })

  it('番号で文に対応させる（順が違っても）。返ってこなかった文は空、範囲の外・重複は捨てる', () => {
    assert.deepEqual(
      parseTranslations(
        json([
          { n: 3, ja: ' 三 ' },
          { n: 1, ja: '一' },
          { n: 1, ja: '重複' },
          { n: 9, ja: '外' },
          { n: 0, ja: '外' },
          { n: 'x', ja: '形が違う' },
        ]),
        3,
      ),
      ['一', '', '三'],
    )
  })

  it('読めない・1 つも無ければ AiOutputError', () => {
    assert.throws(() => parseTranslations('{', 1), AiOutputError)
    assert.throws(() => parseTranslations('{}', 1), AiOutputError)
    assert.throws(() => parseTranslations(json([]), 2), AiOutputError)
  })
})

describe('parseTranslation（保存した訳）', () => {
  it('読み戻せる。壊れていれば null', () => {
    const saved = {
      version: 1,
      translatedAt: '2026-11-11T00:00:00Z',
      draft: 'I agree.',
      title: { en: 'T', ja: '題' },
      sentences: [{ en: 'I agree.', ja: '私は賛成する。' }, { en: 'x' }, { ja: 'en が無い' }],
    }
    assert.deepEqual(parseTranslation(JSON.stringify(saved)), {
      ...saved,
      sentences: [
        { en: 'I agree.', ja: '私は賛成する。' },
        { en: 'x', ja: '' },
      ],
    })
    // タイトルの無い古い結果は null として読む
    const { title: _title, ...old } = saved
    assert.equal(parseTranslation(JSON.stringify(old))?.title, null)
    assert.equal(parseTranslation('{'), null)
    assert.equal(parseTranslation('{"version":2,"sentences":[]}'), null)
  })
})
