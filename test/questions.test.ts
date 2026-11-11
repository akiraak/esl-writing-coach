import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiOutputError } from '../src/ai/errors.js'
import { buildQuestionPrompt, parseAnswer, QUESTION_SYSTEM } from '../src/ai/questions.js'

const at = '2026-11-11T00:00:00.000Z'

describe('AI案への質問のプロンプト', () => {
  it('システム: 日本語で答え、英文・直した項目は出さない。頼まれても書かない。テーマの候補だけ語句の説明は可', () => {
    assert.ok(QUESTION_SYSTEM.includes('**日本語で**'))
    assert.ok(
      QUESTION_SYSTEM.includes('英語の文や、そのまま英訳すれば本文になる完成した文章は書きません'),
    )
    assert.ok(QUESTION_SYSTEM.includes('アウトラインを直した項目・書き換えた案'))
    assert.ok(QUESTION_SYSTEM.includes('「英語で書いて」'))
    assert.ok(QUESTION_SYSTEM.includes('テーマの候補についての質問に限り'))
  })

  it('理由・例の候補: テーマ・条件・候補（立場・理由・例）と、前のやりとり・今回の質問が入る', () => {
    const prompt = buildQuestionPrompt({
      context: {
        kind: 'ideas',
        saved: {
          theme: 'Uniforms',
          conditions: '',
          ideas: {
            sides: [
              {
                stance: 'for',
                opinion: '制服に賛成',
                reasons: [{ reason: '朝が楽', examples: ['服を選ばない'] }],
              },
            ],
          },
          createdAt: at,
        },
      },
      history: [{ question: '前の質問', answer: '前の答え', createdAt: at }],
      question: ' 理由 1 をもっと具体的に？ ',
    })
    assert.ok(prompt.includes('## 課題のテーマ\nUniforms'))
    assert.ok(prompt.includes('## 課題の条件\n（なし）'))
    assert.ok(prompt.includes('### 賛成: 制服に賛成\n理由 1: 朝が楽\n  - 例: 服を選ばない'))
    assert.ok(
      prompt.includes(
        '### 1 回目\n<question>\n前の質問\n</question>\n<answer>\n前の答え\n</answer>',
      ),
    )
    assert.ok(prompt.endsWith('## 今回の質問\n<question>\n理由 1 をもっと具体的に？\n</question>'))
  })

  it('テーマの候補: 分野と候補（英語・日本語訳）。やりとりが無ければ（なし）', () => {
    const prompt = buildQuestionPrompt({
      context: {
        kind: 'themes',
        saved: { hint: '', themes: [{ en: 'Should we?', ja: 'すべきか' }], createdAt: at },
      },
      history: [],
      question: 'q',
    })
    assert.ok(prompt.includes('## 生徒が入れた分野・キーワード\n（なし）'))
    assert.ok(prompt.includes('1. Should we?（すべきか）'))
    assert.ok(prompt.includes('## それまでのやりとり\n（なし）'))
  })

  it('アウトラインの指摘: アウトラインと指摘（引用・ヒント）が入る', () => {
    const prompt = buildQuestionPrompt({
      context: {
        kind: 'outline',
        saved: {
          theme: 'T',
          conditions: 'C',
          outline: '意見\n\t理由\n\n',
          review: { summary: 'よい', findings: [{ quote: '理由', hint: '例が無い' }] },
          createdAt: at,
        },
      },
      history: [],
      question: 'q',
    })
    assert.ok(prompt.includes('<outline>\n意見\n\t理由\n</outline>'))
    assert.ok(prompt.includes('全体: よい\n1. 「理由」 例が無い'))
  })
})

describe('AI案への質問の答え', () => {
  it('answer の前後の空白を落として返す。空・形が違えば AiOutputError', () => {
    assert.equal(parseAnswer(JSON.stringify({ answer: ' 答え\n' })), '答え')
    assert.throws(() => parseAnswer(JSON.stringify({ answer: '  ' })), AiOutputError)
    assert.throws(() => parseAnswer('[]'), AiOutputError)
    assert.throws(() => parseAnswer('{'), AiOutputError)
  })
})
