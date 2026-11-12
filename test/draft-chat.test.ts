import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDraftChatMessages,
  DRAFT_ANSWER_MAX_LENGTH,
  DRAFT_CHAT_SYSTEM,
  parseDraftAnswer,
} from '../src/ai/draft-chat.js'
import { AiOutputError } from '../src/ai/errors.js'
import { parseAssignment } from '../src/shared/assignment.js'

const assignment = parseAssignment(
  '# Should students wear school uniforms?\n\n- 語数: 120-150\n- 文数: 8-10\n\n## 条件\n\nFirst / Second / Finally を使う。\n',
)

describe('buildDraftChatMessages', () => {
  it('最初に課題・アプリが数えた値・下書き。それまでのやりとりは user / assistant の順の会話で、最後が今回の質問', () => {
    const messages = buildDraftChatMessages({
      assignment,
      draft: '  I think students should wear uniforms. First, it save time.\n',
      title: ' School Uniforms ',
      history: [
        { question: 'because と since の違いは？', answer: ' ほぼ同じです。 ', createdAt: 'x' },
        { question: '例文を見せて', answer: 'I stayed home because it rained.', createdAt: 'y' },
      ],
      question: ' その英文で良い？ ',
    })
    assert.deepEqual(
      messages.map((m) => m.role),
      ['user', 'assistant', 'user', 'assistant', 'user'],
    )
    const prompt = messages[0]?.content ?? ''
    assert.match(prompt, /テーマ: Should students wear school uniforms\?/)
    assert.match(prompt, /語数の指定: 120–150 語/)
    assert.match(prompt, /First \/ Second \/ Finally を使う。/)
    assert.match(prompt, /- 語数: 10\n- 文数: 2/)
    assert.match(prompt, /## 生徒のタイトル（今の時点）\n<title>School Uniforms<\/title>/)
    assert.match(
      prompt,
      /<paragraph>\nI think students should wear uniforms\. First, it save time\.\n<\/paragraph>/,
    )
    assert.match(prompt, /## 質問\n<question>\nbecause と since の違いは？\n<\/question>$/)
    // 答えは出力と同じ JSON の形。あとの質問には課題・下書きを付けない
    assert.deepEqual(messages.slice(1), [
      { role: 'assistant', content: '{"answer":"ほぼ同じです。"}' },
      { role: 'user', content: '<question>\n例文を見せて\n</question>' },
      { role: 'assistant', content: '{"answer":"I stayed home because it rained."}' },
      { role: 'user', content: '<question>\nその英文で良い？\n</question>' },
    ])
  })

  it('下書きが空なら「まだ書いていません」、やりとりが無ければメッセージは 1 つ', () => {
    const messages = buildDraftChatMessages({
      assignment: parseAssignment(''),
      draft: ' \n',
      title: '',
      history: [],
      question: '書き出しはどうする？',
    })
    assert.equal(messages.length, 1)
    const prompt = messages[0]?.content ?? ''
    assert.match(prompt, /## 生徒の下書き（今の時点）\n（まだ書いていません）/)
    assert.match(prompt, /## 生徒のタイトル（今の時点）\n（まだ書いていません）/)
    assert.doesNotMatch(prompt, /<paragraph>/)
    assert.match(prompt, /- 語数: 0\n- 文数: 0/)
    assert.match(prompt, /テーマ: （未入力）/)
    assert.match(prompt, /## 質問\n<question>\n書き出しはどうする？\n<\/question>$/)
  })
})

describe('DRAFT_CHAT_SYSTEM', () => {
  it('英語は制限しないが、頼まれていない全体の書き直しはしない', () => {
    assert.match(DRAFT_CHAT_SYSTEM, /英語は必要なだけ使ってかまいません/)
    assert.match(DRAFT_CHAT_SYSTEM, /頼まれていないのに、下書き全体を書き直したり/)
    assert.match(DRAFT_CHAT_SYSTEM, /日本語で/)
    assert.match(DRAFT_CHAT_SYSTEM, /これは続きの会話です/)
    assert.match(DRAFT_CHAT_SYSTEM, /まず\*\*直前のやりとり/)
  })
})

describe('parseDraftAnswer', () => {
  it('答えの文を返す（前後の空白は落とす。英文もそのまま）', () => {
    assert.equal(
      parseDraftAnswer(JSON.stringify({ answer: ' it saves time と直します。\n' })),
      'it saves time と直します。',
    )
  })

  it('空・長すぎ・形が違うものは AiOutputError', () => {
    for (const raw of [
      'not json',
      '[]',
      '{}',
      JSON.stringify({ answer: 3 }),
      JSON.stringify({ answer: '  ' }),
      JSON.stringify({ answer: 'あ'.repeat(DRAFT_ANSWER_MAX_LENGTH + 1) }),
    ]) {
      assert.throws(() => parseDraftAnswer(raw), AiOutputError, raw.slice(0, 30))
    }
    assert.doesNotThrow(() =>
      parseDraftAnswer(JSON.stringify({ answer: 'あ'.repeat(DRAFT_ANSWER_MAX_LENGTH) })),
    )
  })
})
