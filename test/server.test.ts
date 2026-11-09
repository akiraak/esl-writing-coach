import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { Ai } from '../src/ai/client.js'
import { AiApiError, AiRefusedError } from '../src/ai/errors.js'
import {
  FeedbackConflictError,
  InvalidParagraphIdError,
  NEW_FILE_FORMAT,
  type ParagraphStore,
  type ParagraphSummary,
  type SaveBase,
  type Stage,
  StageConflictError,
} from '../src/paragraphs/store.js'
import { CONTENT_SECURITY_POLICY } from '../src/server/guard.js'
import { createAppHandler, listen } from '../src/server/server.js'
import type { Feedback } from '../src/shared/feedback.js'
import type { ParagraphListItem } from '../src/shared/types.js'

/**
 * サーバを空きポートで立て、`fetch` で叩く。保存層は偽物（Dropbox は叩かない）。
 * Host のチェックはポートまで見るので、立てたあとのポートを handler に渡す。
 */

interface Call {
  op: string
  args: unknown[]
}

function fakeStore() {
  const calls: Call[] = []
  const texts = new Map<string, { text: string; rev: string }>()
  let revs = 0
  const check = (id: string) => {
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) throw new InvalidParagraphIdError(id)
  }
  const store: ParagraphStore = {
    async listParagraphs(): Promise<ParagraphSummary[]> {
      calls.push({ op: 'list', args: [] })
      return [
        {
          id: '2026-11-08-a',
          createdOn: '2026-11-08',
          updatedAt: '2026-11-08T01:00:00Z',
          files: {
            assignment: { rev: 'a1', size: 10, serverModified: '2026-11-08T01:00:00Z' },
          },
          started: { assignment: true, ideas: false, outline: false, draft: false },
        },
      ]
    },
    async readStage(id: string, stage: Stage) {
      check(id)
      calls.push({ op: 'read', args: [id, stage] })
      const got = texts.get(`${id}/${stage}`)
      return got === undefined
        ? { text: '', rev: null, format: NEW_FILE_FORMAT }
        : { text: got.text, rev: got.rev, format: NEW_FILE_FORMAT }
    },
    async saveStage(id: string, stage: Stage, text: string, base: SaveBase) {
      check(id)
      calls.push({ op: 'save', args: [id, stage, text, base] })
      const key = `${id}/${stage}`
      if ((texts.get(key)?.rev ?? null) !== base.rev) throw new StageConflictError(id, stage)
      revs += 1
      texts.set(key, { text, rev: `r${revs}` })
      return { rev: `r${revs}`, size: text.length, serverModified: '2026-11-08T02:00:00Z' }
    },
    async createParagraph(date: string, theme: string) {
      calls.push({ op: 'create', args: [date, theme] })
      return `${date}-new`
    },
    async deleteParagraph(id: string) {
      check(id)
      calls.push({ op: 'delete', args: [id] })
    },
    async readFeedback(id: string) {
      check(id)
      calls.push({ op: 'readFeedback', args: [id] })
      return feedback
    },
    async saveFeedback(id: string, text: string, rev: string | null) {
      check(id)
      calls.push({ op: 'saveFeedback', args: [id, rev] })
      if ((feedback?.rev ?? null) !== rev) throw new FeedbackConflictError(id)
      revs += 1
      feedback = { text, rev: `f${revs}` }
    },
  }
  let feedback: { text: string; rev: string } | null = null
  return { store, calls }
}

let server: Server
let base: string
let port: number
let fake: ReturnType<typeof fakeStore>
let webDir: string
/** 偽の AI（テストごとに差し替える。null ならキーが無い扱い）。使わないメソッドは呼ばれたら落ちる。 */
let ai: Ai | null = null
const fakeAi = (methods: Partial<Ai>): Ai => ({
  score: () => Promise.reject(new Error('score は呼ばれないはず')),
  suggestThemes: () => Promise.reject(new Error('suggestThemes は呼ばれないはず')),
  suggestIdeas: () => Promise.reject(new Error('suggestIdeas は呼ばれないはず')),
  reviewOutline: () => Promise.reject(new Error('reviewOutline は呼ばれないはず')),
  ...methods,
})

before(async () => {
  webDir = await mkdtemp(path.join(tmpdir(), 'esl-web-'))
  await writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>t</title>')
  await writeFile(path.join(webDir, 'style.css'), 'body{}')
  await writeFile(path.join(webDir, 'app.js'), 'console.log(1)')
  // ポートは立ててから分かるので、handler は毎回そのポートで作り直す
  let handler: ReturnType<typeof createAppHandler> | null = null
  server = await listen((req, res) => handler?.(req, res), 0, '127.0.0.1')
  port = (server.address() as AddressInfo).port
  base = `http://127.0.0.1:${port}`
  handler = (req, res) =>
    createAppHandler({
      port,
      store: fake.store,
      webDir,
      bundleDir: webDir,
      today: () => '2026-11-08',
      ai,
      now: () => '2026-11-08T03:00:00.000Z',
    })(req, res)
})

after(() => {
  server.close()
})

beforeEach(() => {
  fake = fakeStore()
  ai = null
})

const WRITE = { 'content-type': 'application/json', 'x-esl-request': '1' }

describe('API', () => {
  it('GET /api/paragraphs は一覧（assignment.md のテーマ付き）', async () => {
    await fake.store.saveStage('2026-11-08-a', 'assignment', '# Uniforms\n', {
      rev: null,
      format: NEW_FILE_FORMAT,
    })
    const res = await fetch(`${base}/api/paragraphs`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { paragraphs: ParagraphListItem[] }
    assert.equal(body.paragraphs[0]?.id, '2026-11-08-a')
    assert.equal(body.paragraphs[0]?.theme, 'Uniforms')
  })

  it('POST /api/paragraphs はサーバの今日の日付で作り、テーマ入りの assignment.md を書く（前後の空白は落とす）', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: '  School uniforms ' }),
    })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { id: '2026-11-08-new' })
    assert.deepEqual(fake.calls, [
      { op: 'create', args: ['2026-11-08', 'School uniforms'] },
      {
        op: 'save',
        args: [
          '2026-11-08-new',
          'assignment',
          '# School uniforms\n\n- 語数:\n- 文数:\n\n## 条件\n',
          { rev: null, format: NEW_FILE_FORMAT },
        ],
      },
    ])
  })

  it('POST のテーマが文字列でなければ 400', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: 1 }),
    })
    assert.equal(res.status, 400)
    assert.equal(fake.calls.length, 0)
  })

  it('段階のファイルを読み、rev を付けて保存し、古い rev なら 409', async () => {
    const url = `${base}/api/paragraphs/2026-11-08-a/stages/draft`
    const opened = (await (await fetch(url)).json()) as { text: string; rev: string | null }
    assert.deepEqual(opened, { text: '', rev: null, format: NEW_FILE_FORMAT })

    const put = (rev: string | null, text: string) =>
      fetch(url, {
        method: 'PUT',
        headers: WRITE,
        body: JSON.stringify({ text, rev, format: NEW_FILE_FORMAT }),
      })
    const first = await put(null, 'In my opinion')
    assert.equal(first.status, 200)
    const saved = (await first.json()) as { rev: string }
    assert.equal(saved.rev, 'r1')

    const second = await put('r1', 'In my opinion, ...')
    assert.equal(second.status, 200)

    const stale = await put('r1', 'stale')
    assert.equal(stale.status, 409)
    assert.equal(((await stale.json()) as { error: string }).error, 'conflict')
  })

  it('PUT の本文・rev・format が不正なら 400（保存層に渡さない）', async () => {
    const url = `${base}/api/paragraphs/2026-11-08-a/stages/draft`
    for (const body of [
      { rev: null, format: NEW_FILE_FORMAT },
      { text: 'x', rev: '', format: NEW_FILE_FORMAT },
      { text: 'x', rev: null, format: { eol: 'cr', bom: false, finalNewline: false } },
    ]) {
      const res = await fetch(url, { method: 'PUT', headers: WRITE, body: JSON.stringify(body) })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    const bad = await fetch(url, { method: 'PUT', headers: WRITE, body: '{' })
    assert.equal(bad.status, 400)
    assert.equal(fake.calls.length, 0)
  })

  it('知らない段階・不正な id は 400', async () => {
    assert.equal((await fetch(`${base}/api/paragraphs/2026-11-08-a/stages/notes`)).status, 400)
    assert.equal((await fetch(`${base}/api/paragraphs/..%2Fsecret/stages/draft`)).status, 400)
  })

  it('DELETE /api/paragraphs/:id は 204', async () => {
    const res = await fetch(`${base}/api/paragraphs/2026-11-08-a`, {
      method: 'DELETE',
      headers: WRITE,
    })
    assert.equal(res.status, 204)
    assert.deepEqual(fake.calls, [{ op: 'delete', args: ['2026-11-08-a'] }])
  })

  it('書き込みに X-ESL-Request が無ければ 403（別のサイトから送らせない）', async () => {
    const res = await fetch(`${base}/api/paragraphs/2026-11-08-a`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(res.status, 403)
    assert.equal(fake.calls.length, 0)
  })

  it('知らない API は 404、使えないメソッドは 405', async () => {
    assert.equal((await fetch(`${base}/api/nothing`)).status, 404)
    assert.equal(
      (await fetch(`${base}/api/paragraphs`, { method: 'PUT', headers: WRITE, body: '{}' })).status,
      405,
    )
  })
})

const SCORES = {
  structure: { score: 24, comment: '' },
  content: { score: 20, comment: '' },
  grammar: { score: 15, comment: '' },
  vocabulary: { score: 11, comment: '' },
  requirements: { score: 8, comment: '' },
}

describe('採点の API', () => {
  const putDraft = (text: string) =>
    fake.store.saveStage('2026-11-08-a', 'draft', text, { rev: null, format: NEW_FILE_FORMAT })
  const post = () =>
    fetch(`${base}/api/paragraphs/2026-11-08-a/feedback`, {
      method: 'POST',
      headers: WRITE,
      body: '{}',
    })

  it('GET は無ければ feedback: null と、キーがあるか', async () => {
    const res = await fetch(`${base}/api/paragraphs/2026-11-08-a/feedback`)
    assert.deepEqual(await res.json(), { feedback: null, aiConfigured: false })
  })

  it('POST は保存されている下書きと課題で採点し、feedback.json に書いて返す。合計はアプリが足す', async () => {
    let received: unknown = null
    ai = fakeAi({
      async score(input) {
        received = input
        return {
          output: {
            scores: SCORES,
            strengths: ['よい'],
            findings: [
              { criterion: 'grammar', quote: 'I agree', hint: 'そのまま' },
              { criterion: 'grammar', quote: 'I agreed.', hint: '直した形の引用は消える' },
            ],
          },
          model: 'claude-opus-5-5',
        }
      },
    })
    await fake.store.saveStage('2026-11-08-a', 'assignment', '# Uniforms\n\n- 語数: 100-\n', {
      rev: null,
      format: NEW_FILE_FORMAT,
    })
    await putDraft('I agree.')
    const res = await post()
    assert.equal(res.status, 200)
    const { feedback } = (await res.json()) as { feedback: Feedback }
    assert.equal(feedback.total, 78)
    assert.equal(feedback.draft, 'I agree.')
    assert.equal(feedback.scoredAt, '2026-11-08T03:00:00.000Z')
    assert.deepEqual(
      feedback.findings.map((f) => f.quote),
      ['I agree', ''],
    )
    assert.deepEqual((received as { assignment: { words: unknown } }).assignment.words, {
      min: 100,
      max: null,
    })
    // 2 回目は読んだ rev で update（最新の 1 回分だけ）
    assert.equal((await post()).status, 200)
    const saves = fake.calls.filter((c) => c.op === 'saveFeedback').map((c) => c.args[1])
    assert.deepEqual(saves, [null, 'f3'])
    const got = await (await fetch(`${base}/api/paragraphs/2026-11-08-a/feedback`)).json()
    assert.equal((got as { feedback: Feedback; aiConfigured: boolean }).feedback.total, 78)
    assert.equal((got as { aiConfigured: boolean }).aiConfigured, true)
  })

  it('キーが無ければ 503、下書きが空なら 400（採点器を呼ばない）', async () => {
    assert.equal((await post()).status, 503)
    let called = false
    ai = fakeAi({
      async score() {
        called = true
        throw new Error('呼ばれないはず')
      },
    })
    await putDraft('  \n')
    const res = await post()
    assert.equal(res.status, 400)
    assert.equal(((await res.json()) as { error: string }).error, 'empty_draft')
    assert.equal(called, false)
  })

  it('拒否は 422 ai_refusal、API の失敗は 502 ai_error（feedback.json は書かない）', async () => {
    await putDraft('I agree.')
    ai = fakeAi({
      async score() {
        throw new AiRefusedError('断られました')
      },
    })
    const refused = await post()
    assert.equal(refused.status, 422)
    assert.equal(((await refused.json()) as { error: string }).error, 'ai_refusal')
    ai = fakeAi({
      async score() {
        throw new AiApiError('API キーが正しくありません')
      },
    })
    const failed = await post()
    assert.equal(failed.status, 502)
    assert.deepEqual(await failed.json(), {
      error: 'ai_error',
      message: 'API キーが正しくありません',
    })
    assert.equal(fake.calls.filter((c) => c.op === 'saveFeedback').length, 0)
  })
})

describe('振り返りの API', () => {
  it('GET /api/review は採点のあるパラグラフの最新の採点（無ければ空）', async () => {
    const res = await fetch(`${base}/api/review`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { entries: [] })
    assert.equal(
      (await fetch(`${base}/api/review`, { method: 'POST', headers: WRITE, body: '{}' })).status,
      405,
    )
  })
})

describe('アイデア出しの API', () => {
  const post = (path: string, body: unknown) =>
    fetch(`${base}/api/ai/${path}`, { method: 'POST', headers: WRITE, body: JSON.stringify(body) })

  it('テーマの候補: hint を渡して返す（hint は無くてもよい）', async () => {
    const hints: string[] = []
    ai = fakeAi({
      async suggestThemes(hint) {
        hints.push(hint)
        return [{ en: 'Should we?', ja: 'すべきか' }]
      },
    })
    const res = await post('themes', { hint: '部活' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { themes: [{ en: 'Should we?', ja: 'すべきか' }] })
    assert.equal((await post('themes', {})).status, 200)
    assert.deepEqual(hints, ['部活', ''])
  })

  it('理由・例の候補: テーマと条件を渡す。テーマが空なら 400', async () => {
    let received: unknown = null
    const ideas = { sides: [] }
    ai = fakeAi({
      async suggestIdeas(input) {
        received = input
        return ideas
      },
    })
    const res = await post('ideas', { theme: ' Uniforms ', conditions: '理由を 3 つ' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ideas })
    assert.deepEqual(received, { theme: 'Uniforms', conditions: '理由を 3 つ' })
    const empty = await post('ideas', { theme: '  ' })
    assert.equal(empty.status, 400)
    assert.equal(((await empty.json()) as { error: string }).error, 'empty_theme')
  })

  it('アウトラインの指摘: テーマ・条件・アウトラインを渡す。アウトラインが空なら 400', async () => {
    let received: unknown = null
    const review = { summary: 'よい', findings: [] }
    ai = fakeAi({
      async reviewOutline(input) {
        received = input
        return review
      },
    })
    const res = await post('outline', { theme: 'T', conditions: 'C', outline: '意見\n\t理由' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { review })
    assert.deepEqual(received, { theme: 'T', conditions: 'C', outline: '意見\n\t理由' })
    const empty = await post('outline', { theme: 'T', outline: ' \n' })
    assert.equal(empty.status, 400)
    assert.equal(((await empty.json()) as { error: string }).error, 'empty_outline')
  })

  it('キーが無ければ 503、長すぎる hint は 400、拒否は 422、GET は 405', async () => {
    assert.equal((await post('themes', { hint: 'x' })).status, 503)
    ai = fakeAi({
      async suggestThemes() {
        throw new AiRefusedError('断られました')
      },
    })
    assert.equal((await post('themes', { hint: 'x'.repeat(201) })).status, 400)
    assert.equal((await post('themes', { hint: 'x' })).status, 422)
    assert.equal((await fetch(`${base}/api/ai/themes`)).status, 405)
  })
})

describe('画面のファイル', () => {
  it('/ は index.html を CSP 付きで返す', async () => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    assert.equal(res.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY)
    assert.match(await res.text(), /<!doctype html>/)
  })

  it('/style.css と /app.js を返し、ほかは 404', async () => {
    assert.equal((await fetch(`${base}/style.css`)).status, 200)
    assert.equal((await fetch(`${base}/app.js`)).status, 200)
    assert.equal((await fetch(`${base}/../.env`)).status, 404)
    assert.equal((await fetch(`${base}/package.json`)).status, 404)
  })
})
