import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { AI_TOOL_STEPS, AI_TOOLS, aiTabsFor } from '../src/shared/ai-tools.js'
import { CRITERIA } from '../src/shared/feedback.js'
import {
  apiErrorText,
  DEFAULT_LANG,
  isLang,
  MESSAGES,
  parseLang,
} from '../src/shared/i18n/index.js'

/** 入れ子の辞書を `a.b.c` のキーと値の組に平たくする。 */
function flatten(value: unknown, prefix = ''): [string, unknown][] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) =>
      flatten(v, prefix === '' ? k : `${prefix}.${k}`),
    )
  }
  return [[prefix, value]]
}

/** 辞書の関数を見本の引数で呼ぶ（数・単位・文字列を取るもの。`ai.steps` は番号の配列）。 */
function sample(fn: (...a: unknown[]) => string): string {
  try {
    return fn(1, 'words', 'words')
  } catch {
    return fn([1, 2])
  }
}

describe('辞書（en / ja）', () => {
  it('キーがそろっていて、値の種類（文字列か関数か）も同じ', () => {
    const en = new Map(flatten(MESSAGES.en))
    const ja = new Map(flatten(MESSAGES.ja))
    assert.deepEqual([...en.keys()].sort(), [...ja.keys()].sort())
    for (const [key, value] of ja) assert.equal(typeof en.get(key), typeof value, key)
  })

  it('文字列は空でなく、関数は空でない文字列を返す', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [key, value] of flatten(MESSAGES[lang])) {
        const text =
          typeof value === 'function' ? sample(value as (...a: unknown[]) => string) : value
        assert.equal(typeof text, 'string', `${lang}:${key}`)
        assert.notEqual((text as string).trim(), '', `${lang}:${key}`)
      }
    }
  })

  it('英語の辞書に日本語が混じっていない', () => {
    for (const [key, value] of flatten(MESSAGES.en)) {
      const text =
        typeof value === 'function' ? sample(value as (...a: unknown[]) => string) : value
      assert.doesNotMatch(String(text), JAPANESE, key)
    }
  })

  it('観点の名前は採点の観点（CRITERIA）とそろう', () => {
    for (const lang of ['en', 'ja'] as const) {
      assert.deepEqual(
        Object.keys(MESSAGES[lang].feedback.criteria).sort(),
        CRITERIA.map((c) => c.key).sort(),
      )
    }
  })

  it('AI の機能とタブの名前がそろう', () => {
    for (const lang of ['en', 'ja'] as const) {
      assert.deepEqual(Object.keys(MESSAGES[lang].ai.tools).sort(), [...AI_TOOLS].sort())
      assert.deepEqual(
        Object.keys(MESSAGES[lang].ai.tabs).sort(),
        (aiTabsFor('draft') ?? []).map((x) => x.key).sort(),
      )
    }
    assert.equal(MESSAGES.ja.ai.steps(AI_TOOL_STEPS.ideas), 'STEP 1・2')
    assert.equal(MESSAGES.en.ai.steps(AI_TOOL_STEPS.ideas), 'STEP 1, 2')
  })

  it('引数を入れた文', () => {
    assert.equal(MESSAGES.en.save.savedAt('14:32'), '✓ Saved 14:32')
    assert.equal(MESSAGES.ja.save.savedAt('14:32'), '✓ 保存済み 14:32')
    assert.equal(MESSAGES.en.list.updated('2026-11-17'), 'Updated 2026-11-17')
  })
})

describe('言語', () => {
  it('既定は英語', () => {
    assert.equal(DEFAULT_LANG, 'en')
  })

  it('覚えていた値を読む。知らない値・無ければ既定', () => {
    assert.equal(parseLang('ja'), 'ja')
    assert.equal(parseLang('en'), 'en')
    assert.equal(parseLang(null), 'en')
    assert.equal(parseLang('fr'), 'en')
    assert.equal(isLang('ja'), true)
    assert.equal(isLang('JA'), false)
  })
})

describe('apiErrorText', () => {
  it('知っているコードは今の言語の文', () => {
    assert.equal(apiErrorText(MESSAGES.en, 'empty_draft', '下書きが空です'), 'The draft is empty')
    assert.equal(apiErrorText(MESSAGES.ja, 'empty_draft', '下書きが空です'), '下書きが空です')
  })

  it('知らないコードはサーバの message のまま', () => {
    assert.equal(apiErrorText(MESSAGES.en, 'unknown', 'HTTP 500'), 'HTTP 500')
    // Object.prototype のキーをコードとして扱わない
    assert.equal(apiErrorText(MESSAGES.en, 'toString', 'x'), 'x')
  })

  it('ai_error は API の失敗の中身を添える', () => {
    assert.equal(
      apiErrorText(MESSAGES.en, 'ai_error', 'overloaded'),
      'The AI request failed (overloaded)',
    )
    assert.equal(apiErrorText(MESSAGES.en, 'ai_error', ''), 'The AI request failed')
  })

  it('サーバが返すエラーのコードは全部辞書にある', () => {
    const codes = new Set<string>()
    for (const dir of ['src/server', 'src/ai']) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        const source = readFileSync(join(dir, file), 'utf8')
        for (const m of source.matchAll(/HttpError\(\d+, '(\w+)'/g)) codes.add(m[1] as string)
        for (const m of source.matchAll(/error: '(\w+)'/g)) codes.add(m[1] as string)
      }
    }
    assert.ok(codes.size > 10)
    for (const code of codes) assert.ok(Object.hasOwn(MESSAGES.en.errors.codes, code), code)
  })
})

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/** コメントを除いた、文字列リテラル（'…'・"…"・`…`）の中身。 */
function stringLiterals(source: string): string[] {
  const out: string[] = []
  const re =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g
  for (const m of source.matchAll(re)) {
    const token = m[0]
    if (token.startsWith('/')) continue
    out.push(token)
  }
  return out
}

/**
 * 訳し終えたファイルに、画面の文字の日本語が直書きで残っていないか（画面のファイルを足したらここにも足す。`docs/plans/archive/ui-english.md`）。
 * 値は、そのファイルで残してよい文字列（を含むリテラル）。言語の名前・まだ訳していない後の Phase の部品など。
 */
const TRANSLATED: Readonly<Record<string, readonly string[]>> = {
  'src/browser/main.ts': [],
  'src/browser/i18n.ts': [],
  'src/browser/views/list.ts': [],
  // Phase 2: 編集画面
  'src/browser/views/edit.ts': [],
  'src/browser/views/assignment.ts': [],
  'src/browser/views/outline.ts': [],
  'src/browser/views/draft.ts': [],
  'src/browser/views/brief.ts': [],
  'src/browser/stage-editor.ts': [],
  'src/browser/export-dialog.ts': [],
  'src/browser/pane-resizer.ts': [],
  'src/browser/map.ts': [],
  'src/shared/meter.ts': [],
  'src/shared/outline-checks.ts': [],
  'src/shared/outline-prompts.ts': [],
  // describeRange は AI のプロンプト用（日本語のまま）
  'src/shared/stage-summary.ts': ['以上`', '以下`'],
  // 言語の切り替えのボタンの名前（その言語自身の名前で出す）
  'src/browser/ui.ts': ["'日本語'"],
  // Phase 3: 右ペイン（AI）
  'src/shared/ai-tools.ts': [],
  'src/browser/ai-pane.ts': [],
  'src/browser/ideas-pane.ts': [],
  'src/browser/ai-questions.ts': [],
  'src/browser/draft-chat-pane.ts': [],
  'src/browser/translation-pane.ts': [],
  'src/browser/feedback-pane.ts': [],
  // Phase 4: 学習ガイドと振り返り（学習ガイドの中身 `src/shared/guide.ts` は言語ごとの文と、両方の UI で出す日本語を持つので対象外）
  'src/browser/guide-content.ts': [],
  'src/browser/guide-pane.ts': [],
  'src/browser/views/guide.ts': [],
  'src/browser/views/review.ts': [],
  'src/shared/review.ts': [],
}

describe('直書きの日本語', () => {
  for (const [file, allowed] of Object.entries(TRANSLATED)) {
    it(file, () => {
      const left = stringLiterals(readFileSync(file, 'utf8')).filter(
        (s) => JAPANESE.test(s) && !allowed.some((a) => s.includes(a)),
      )
      assert.deepEqual(left, [])
    })
  }
})
