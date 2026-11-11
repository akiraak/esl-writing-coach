import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { Ai } from '../src/ai/client.js'
import type { DraftChatInput } from '../src/ai/draft-chat.js'
import { AiApiError, AiRefusedError } from '../src/ai/errors.js'
import { openDatabase } from '../src/paragraphs/database.js'
import { createParagraphStore, type ParagraphStore } from '../src/paragraphs/store.js'
import { CONTENT_SECURITY_POLICY } from '../src/server/guard.js'
import { createAppHandler, listen } from '../src/server/server.js'
import type { Feedback } from '../src/shared/feedback.js'
import type { SavedAiResults } from '../src/shared/ideas.js'
import type { ParagraphListItem } from '../src/shared/types.js'

/**
 * サーバを空きポートで立て、`fetch` で叩く。保存層は `:memory:` の SQLite（テストごとに作り直す）。
 * Host のチェックはポートまで見るので、立てたあとのポートを handler に渡す。
 * 各テストの初めに `2026-11-08-a`（テーマ Uniforms）を 1 つ作っておく。
 */

const ID = '2026-11-08-a'

let server: Server
let base: string
let port: number
let store: ParagraphStore
let webDir: string
/** 偽の AI（テストごとに差し替える。null ならキーが無い扱い）。使わないメソッドは呼ばれたら落ちる。 */
let ai: Ai | null = null
const fakeAi = (methods: Partial<Ai>): Ai => ({
  score: () => Promise.reject(new Error('score は呼ばれないはず')),
  suggestThemes: () => Promise.reject(new Error('suggestThemes は呼ばれないはず')),
  suggestIdeas: () => Promise.reject(new Error('suggestIdeas は呼ばれないはず')),
  reviewOutline: () => Promise.reject(new Error('reviewOutline は呼ばれないはず')),
  answerQuestion: () => Promise.reject(new Error('answerQuestion は呼ばれないはず')),
  answerDraftQuestion: () => Promise.reject(new Error('answerDraftQuestion は呼ばれないはず')),
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
      store,
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
  store = createParagraphStore(openDatabase(':memory:'), { now: () => '2026-11-08T01:00:00.000Z' })
  store.createParagraph('2026-11-08', 'a', '# Uniforms\n')
  ai = null
})

const WRITE = { 'content-type': 'application/json', 'x-esl-request': '1' }

describe('API', () => {
  it('GET /api/paragraphs は一覧（課題のテーマ付き）', async () => {
    const res = await fetch(`${base}/api/paragraphs`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { paragraphs: ParagraphListItem[] }
    assert.deepEqual(body.paragraphs, [
      {
        id: ID,
        createdOn: '2026-11-08',
        updatedAt: '2026-11-08T01:00:00.000Z',
        started: { assignment: true, outline: false, draft: false },
        theme: 'Uniforms',
      },
    ])
  })

  it('POST /api/paragraphs はサーバの今日の日付で作り、テーマ入りの課題を書く（前後の空白は落とす）', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: '  School uniforms ' }),
    })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { id: '2026-11-08-school-uniforms' })
    assert.deepEqual(store.readStage('2026-11-08-school-uniforms', 'assignment'), {
      text: '# School uniforms\n\n- 語数:\n- 文数:\n\n## 条件\n',
      rev: '1',
    })
  })

  it('POST のテーマが文字列でなければ 400', async () => {
    const res = await fetch(`${base}/api/paragraphs`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ theme: 1 }),
    })
    assert.equal(res.status, 400)
    assert.equal(store.listParagraphs().length, 1)
  })

  it('段階を読み、rev を付けて保存し、古い rev なら 409', async () => {
    const url = `${base}/api/paragraphs/${ID}/stages/draft`
    const opened = (await (await fetch(url)).json()) as { text: string; rev: string | null }
    assert.deepEqual(opened, { text: '', rev: null })

    const put = (rev: string | null, text: string) =>
      fetch(url, { method: 'PUT', headers: WRITE, body: JSON.stringify({ text, rev }) })
    const first = await put(null, 'In my opinion')
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { rev: '1', updatedAt: '2026-11-08T01:00:00.000Z' })

    const second = await put('1', 'In my opinion, ...')
    assert.equal(second.status, 200)

    const stale = await put('1', 'stale')
    assert.equal(stale.status, 409)
    assert.equal(((await stale.json()) as { error: string }).error, 'conflict')
    assert.equal(store.readStage(ID, 'draft').text, 'In my opinion, ...')
  })

  it('PUT の本文・rev が不正なら 400（保存しない）', async () => {
    const url = `${base}/api/paragraphs/${ID}/stages/draft`
    for (const body of [{ rev: null }, { text: 'x', rev: '' }, { text: 'x', rev: 1 }]) {
      const res = await fetch(url, { method: 'PUT', headers: WRITE, body: JSON.stringify(body) })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    const bad = await fetch(url, { method: 'PUT', headers: WRITE, body: '{' })
    assert.equal(bad.status, 400)
    assert.deepEqual(store.readStage(ID, 'draft'), { text: '', rev: null })
  })

  it('知らない段階・不正な id は 400、無いパラグラフは 404', async () => {
    assert.equal((await fetch(`${base}/api/paragraphs/${ID}/stages/notes`)).status, 400)
    assert.equal((await fetch(`${base}/api/paragraphs/..%2Fsecret/stages/draft`)).status, 400)
    const missing = await fetch(`${base}/api/paragraphs/2026-11-08-none/stages/draft`)
    assert.equal(missing.status, 404)
    assert.equal(((await missing.json()) as { error: string }).error, 'not_found')
  })

  it('DELETE /api/paragraphs/:id は 204 で、一覧から消える', async () => {
    const res = await fetch(`${base}/api/paragraphs/${ID}`, {
      method: 'DELETE',
      headers: WRITE,
    })
    assert.equal(res.status, 204)
    assert.deepEqual(store.listParagraphs(), [])
  })

  it('書き込みに X-ESL-Request が無ければ 403（別のサイトから送らせない）', async () => {
    const res = await fetch(`${base}/api/paragraphs/${ID}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(res.status, 403)
    assert.equal(store.listParagraphs().length, 1)
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
  const putDraft = (text: string) => store.saveStage(ID, 'draft', text, null)
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

  it('POST は保存されている下書きと課題で採点し、保存して返す。合計はアプリが足す', async () => {
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
    store.saveStage(ID, 'assignment', '# Uniforms\n\n- 語数: 100-\n', '1')
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
    // 2 回目は上書き（最新の 1 回分だけ）
    assert.equal((await post()).status, 200)
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

  it('拒否は 422 ai_refusal、API の失敗は 502 ai_error（採点は保存しない）', async () => {
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
    assert.equal(store.readFeedback(ID), null)
  })
})

describe('振り返りの API', () => {
  it('GET /api/review は採点のあるパラグラフの最新の採点（無ければ空。読めないものは飛ばす）', async () => {
    const res = await fetch(`${base}/api/review`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { entries: [] })
    const feedback: Feedback = {
      version: 1,
      scoredAt: '2026-11-08T03:00:00.000Z',
      model: 'm',
      draft: 'I agree.',
      total: 78,
      scores: SCORES,
      strengths: [],
      findings: [],
    }
    store.saveFeedback(ID, JSON.stringify(feedback))
    const other = store.createParagraph('2026-11-08', 'b', '# B\n')
    store.saveFeedback(other, '{ broken')
    assert.deepEqual(await (await fetch(`${base}/api/review`)).json(), {
      entries: [{ id: ID, theme: 'Uniforms', feedback }],
    })
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

  it('id を付けると、終わったときに入力と一緒に AI案として保存し、GET /api/paragraphs/:id/ai で返す', async () => {
    const ideas = { sides: [] }
    const review = { summary: 'よい', findings: [] }
    ai = fakeAi({
      suggestThemes: async () => [{ en: 'Q?', ja: '問い' }],
      suggestIdeas: async () => ideas,
      reviewOutline: async () => review,
    })
    const url = `${base}/api/paragraphs/${ID}/ai`
    const noQuestions = { themes: [], ideas: [], outline: [] }
    assert.deepEqual(await (await fetch(url)).json(), {
      themes: null,
      ideas: null,
      outline: null,
      questions: noQuestions,
      draftQuestions: [],
    })
    assert.equal((await post('themes', { id: ID, hint: '部活' })).status, 200)
    assert.equal((await post('ideas', { id: ID, theme: 'T', conditions: 'C' })).status, 200)
    assert.equal((await post('outline', { id: ID, theme: 'T', outline: '意見' })).status, 200)
    const at = '2026-11-08T03:00:00.000Z'
    const saved: SavedAiResults = {
      themes: { hint: '部活', themes: [{ en: 'Q?', ja: '問い' }], createdAt: at },
      ideas: { theme: 'T', conditions: 'C', ideas, createdAt: at },
      outline: { theme: 'T', conditions: '', outline: '意見', review, createdAt: at },
      questions: noQuestions,
      draftQuestions: [],
    }
    assert.deepEqual(await (await fetch(url)).json(), saved)
    // id が無ければ保存しない。形の違う id は 400（AI を呼ばない）
    assert.equal((await post('themes', { hint: 'x' })).status, 200)
    assert.equal(((await (await fetch(url)).json()) as SavedAiResults).themes?.hint, '部活')
    assert.equal((await post('themes', { id: '../x', hint: 'x' })).status, 400)
    assert.equal((await fetch(`${base}/api/paragraphs/2026-11-08-none/ai`)).status, 404)
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

describe('AI案への質問の API', () => {
  const ask = (kind: string, question: unknown) =>
    fetch(`${base}/api/paragraphs/${ID}/ai/${kind}/questions`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ question }),
    })
  const ideas = { sides: [] }
  const saveIdeas = () =>
    fetch(`${base}/api/ai/ideas`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ id: ID, theme: 'T', conditions: 'C' }),
    })
  const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error

  it('保存してある AI案と前のやりとりを渡して答え、保存して返す。GET の questions にも出る', async () => {
    const received: unknown[] = []
    ai = fakeAi({
      suggestIdeas: async () => ideas,
      async answerQuestion(input) {
        received.push(input)
        return `答え${received.length}`
      },
    })
    assert.equal((await saveIdeas()).status, 200)
    const first = await ask('ideas', ' 理由 2 の意味は？ ')
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), {
      question: '理由 2 の意味は？',
      answer: '答え1',
      createdAt: '2026-11-08T01:00:00.000Z',
    })
    assert.equal((await ask('ideas', 'もっと具体的に？')).status, 200)
    const at = '2026-11-08T03:00:00.000Z'
    assert.deepEqual(received[1], {
      context: { kind: 'ideas', saved: { theme: 'T', conditions: 'C', ideas, createdAt: at } },
      history: [
        { question: '理由 2 の意味は？', answer: '答え1', createdAt: '2026-11-08T01:00:00.000Z' },
      ],
      question: 'もっと具体的に？',
    })
    const got = (await (await fetch(`${base}/api/paragraphs/${ID}/ai`)).json()) as SavedAiResults
    assert.deepEqual(
      got.questions.ideas.map((q) => q.answer),
      ['答え1', '答え2'],
    )
    assert.deepEqual(got.questions.themes, [])
    // AI案を出し直すと、その種類の質問は消える
    assert.equal((await saveIdeas()).status, 200)
    const again = (await (await fetch(`${base}/api/paragraphs/${ID}/ai`)).json()) as SavedAiResults
    assert.deepEqual(again.questions.ideas, [])
  })

  it('空・長すぎる質問、知らない種類、まだ無い AI案、キーが無いときは答えない', async () => {
    assert.equal(await errorOf(await ask('ideas', '  ')), 'bad_question')
    assert.equal(await errorOf(await ask('ideas', 'x'.repeat(1001))), 'bad_question')
    assert.equal(await errorOf(await ask('scores', '何？')), 'bad_kind')
    assert.equal((await ask('ideas', '何？')).status, 503)
    ai = fakeAi({ suggestIdeas: async () => ideas })
    assert.equal(await errorOf(await ask('ideas', '何？')), 'no_result')
    assert.equal((await fetch(`${base}/api/paragraphs/${ID}/ai/ideas/questions`)).status, 405)
  })

  it('10 回までで、それを超えると 400 too_many_questions', async () => {
    ai = fakeAi({ suggestIdeas: async () => ideas, answerQuestion: async () => 'a' })
    await saveIdeas()
    for (let i = 0; i < 10; i += 1) assert.equal((await ask('ideas', `q${i}`)).status, 200)
    assert.equal(await errorOf(await ask('ideas', 'q10')), 'too_many_questions')
  })

  it('答えを待つ間に AI案が出し直されたら 409 result_changed で、質問は残さない', async () => {
    ai = fakeAi({
      suggestIdeas: async () => ideas,
      async answerQuestion() {
        store.saveAiResult(
          ID,
          'ideas',
          JSON.stringify({ theme: 'T2', conditions: '', ideas, createdAt: 'later' }),
        )
        return 'a'
      },
    })
    await saveIdeas()
    assert.equal(await errorOf(await ask('ideas', 'q')), 'result_changed')
    assert.deepEqual(store.readAiQuestions(ID).ideas, [])
  })
})

describe('「AI に質問」の API', () => {
  const url = () => `${base}/api/paragraphs/${ID}/draft/questions`
  const ask = (question: unknown, id = ID) =>
    fetch(`${base}/api/paragraphs/${id}/draft/questions`, {
      method: 'POST',
      headers: WRITE,
      body: JSON.stringify({ question }),
    })
  const clear = () => fetch(url(), { method: 'DELETE', headers: WRITE, body: '{}' })
  const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error
  const saved = async () =>
    ((await (await fetch(`${base}/api/paragraphs/${ID}/ai`)).json()) as SavedAiResults)
      .draftQuestions

  it('保存されている下書き・課題と前のやりとりを渡して答え、保存して返す。GET の draftQuestions にも出る', async () => {
    const received: DraftChatInput[] = []
    ai = fakeAi({
      async answerDraftQuestion(input) {
        received.push(input)
        return `答え${received.length}`
      },
    })
    store.saveStage(ID, 'assignment', '# Uniforms\n\n- 語数: 120-150\n', '1')
    store.saveStage(ID, 'draft', 'I like uniforms.', null)
    const first = await ask(' because と since の違いは？ ')
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), {
      question: 'because と since の違いは？',
      answer: '答え1',
      createdAt: '2026-11-08T01:00:00.000Z',
    })
    assert.equal((await ask('1 文目は自然？')).status, 200)
    assert.equal(received[1]?.assignment.theme, 'Uniforms')
    assert.deepEqual(received[1]?.assignment.words, { min: 120, max: 150 })
    assert.equal(received[1]?.draft, 'I like uniforms.')
    assert.deepEqual(received[1]?.history, [
      {
        question: 'because と since の違いは？',
        answer: '答え1',
        createdAt: '2026-11-08T01:00:00.000Z',
      },
    ])
    assert.equal(received[1]?.question, '1 文目は自然？')
    assert.deepEqual(
      (await saved()).map((q) => q.answer),
      ['答え1', '答え2'],
    )
  })

  it('下書きが空（まだ無い）でも聞ける', async () => {
    let draft: string | null = null
    ai = fakeAi({
      async answerDraftQuestion(input) {
        draft = input.draft
        return 'a'
      },
    })
    assert.equal((await ask('書き出しは？')).status, 200)
    assert.equal(draft, '')
  })

  it('空・長すぎる質問、無いパラグラフ、キーが無いときは答えない', async () => {
    assert.equal(await errorOf(await ask('  ')), 'bad_question')
    assert.equal(await errorOf(await ask('x'.repeat(1001))), 'bad_question')
    assert.equal(await errorOf(await ask(3)), 'bad_question')
    assert.equal((await ask('何？')).status, 503)
    assert.equal((await ask('何？', '2026-11-08-none')).status, 404)
    assert.equal((await fetch(url())).status, 405)
  })

  it('30 回までで、それを超えると 400 too_many_questions。「はじめから」で消すとまた聞ける', async () => {
    ai = fakeAi({ answerDraftQuestion: async () => 'a' })
    for (let i = 0; i < 30; i += 1) store.addDraftQuestion(ID, `q${i}`, 'a')
    assert.equal(await errorOf(await ask('q30')), 'too_many_questions')
    assert.equal((await clear()).status, 204)
    assert.deepEqual(await saved(), [])
    assert.equal((await ask('q0')).status, 200)
    assert.equal((await saved()).length, 1)
  })

  it('答えを待つ間に「はじめから」にしたら 409 chat_changed で、質問は残さない', async () => {
    ai = fakeAi({
      async answerDraftQuestion() {
        store.clearDraftQuestions(ID)
        return 'a'
      },
    })
    store.addDraftQuestion(ID, 'q0', 'a0')
    assert.equal(await errorOf(await ask('q1')), 'chat_changed')
    assert.deepEqual(store.readDraftQuestions(ID), [])
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
