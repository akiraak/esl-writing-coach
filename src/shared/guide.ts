import type { Role } from './outline-roles.js'

/**
 * 学習ガイドの中身（固定コンテンツ。`docs/plans/archive/learning-guide.md`）。純データ。
 * 学習ガイド画面と編集画面の右ペインで同じものを出す（描き方は `src/browser/guide-content.ts`）。
 *
 * 構成の 4 役割の色はアプリ全体で同じ（Topic = 青 / Reason = 緑 / Example = 橙 / Conclusion = 紫）。
 */

export interface StructurePart {
  role: Role
  name: string
  /** 日本語の名前。 */
  ja: string
  description: string
}

/** 構成の解説（opinion paragraph の型）。 */
export const STRUCTURE: readonly StructurePart[] = [
  {
    role: 'topic',
    name: 'Topic sentence',
    ja: '意見',
    description:
      '段落の最初の 1 文。テーマに対する自分の意見をはっきり書く。「賛成か反対か」が読み手にすぐ分かるようにする。',
  },
  {
    role: 'reason',
    name: 'Reasons',
    ja: '理由',
    description:
      '意見を支える理由を 2〜3 つ。First, / Second, / Finally, などの transition words で始め、順番を示す。',
  },
  {
    role: 'example',
    name: 'Examples / Details',
    ja: '例・詳細',
    description: '理由ごとに、具体的な例・数字・体験を 1〜2 文添える。理由だけでは説得力が弱い。',
  },
  {
    role: 'conclusion',
    name: 'Concluding sentence',
    ja: '結論',
    description:
      '最後の 1 文。topic sentence の意見を別の言葉で言い換えて締める。新しい理由は出さない。',
  },
]

/** 並び（構成の解説の下の図）。 */
export const FLOW: readonly { role: Role; label: string }[] = [
  { role: 'topic', label: 'Topic' },
  { role: 'reason', label: 'Reason 1' },
  { role: 'example', label: 'Example' },
  { role: 'reason', label: 'Reason 2' },
  { role: 'example', label: 'Example' },
  { role: 'reason', label: 'Reason 3' },
  { role: 'example', label: 'Example' },
  { role: 'conclusion', label: 'Conclusion' },
]

export interface ModelSentence {
  role: Role
  text: string
}

export interface ModelParagraph {
  theme: string
  sentences: readonly ModelSentence[]
  /** このモデル文のアウトライン（STEP 2 で作るものの見本。字下げのテキスト）。 */
  outline: string
  /** 書き方のポイント（日本語）。 */
  points: readonly string[]
}

/** モデル文（題材はモックと同じ。2026-11-08 決定）。 */
export const MODEL: ModelParagraph = {
  theme: 'Should high school students have part-time jobs?',
  sentences: [
    { role: 'topic', text: 'I believe that high school students should have part-time jobs.' },
    { role: 'reason', text: 'First, working teaches students how to manage money.' },
    {
      role: 'example',
      text: 'For example, when they earn their own money, they start to think carefully before they buy something.',
    },
    { role: 'reason', text: 'Second, a part-time job helps students learn social skills.' },
    {
      role: 'example',
      text: 'At work, they talk with customers and coworkers of different ages, so they learn how to communicate politely.',
    },
    { role: 'reason', text: 'Finally, students can discover what kind of work they enjoy.' },
    { role: 'example', text: 'This experience can help them choose a future career.' },
    {
      role: 'conclusion',
      text: 'For these reasons, I think that having a part-time job is a valuable experience for high school students.',
    },
  ],
  outline: [
    '高校生はアルバイトをするべきだ',
    '\tお金の管理を学べる',
    '\t\t自分で稼ぐと、買う前によく考えるようになる',
    '\t人と接する力が身につく',
    '\t\tいろいろな年代の客や同僚と話し、丁寧な話し方を覚える',
    '\tどんな仕事が好きか分かる',
    '\t\t将来の仕事を選ぶ助けになる',
    '\t結論: アルバイトは高校生にとって価値のある経験だ',
  ].join('\n'),
  points: [
    '1 文目で意見をはっきり言う（I believe that …）。読み手が最初の 1 文で立場を分かるように。',
    '理由は First, / Second, / Finally, で始めて、いくつ目の理由かを示す。',
    '理由のすぐ後に、その理由の例を 1 文続ける（For example, …）。例の文は理由より具体的に。',
    '結論は For these reasons, で始め、topic sentence を別の言葉で言い換える（should have part-time jobs → a valuable experience）。',
    'アウトラインの 1 項目がおおよそ 1 文になる。日本語のアウトラインを英語の文に置き換えていく。',
  ],
}

export interface PhraseGroup {
  /** 役割の色（つなぎの言葉は役割に属さないので null）。 */
  role: Role | null
  title: string
  phrases: readonly { en: string; ja: string }[]
}

/** 表現集。 */
export const PHRASES: readonly PhraseGroup[] = [
  {
    role: 'topic',
    title: '意見を述べる',
    phrases: [
      { en: 'In my opinion,', ja: '私の意見では' },
      { en: 'I believe that', ja: '〜だと思う' },
      { en: 'I strongly feel that', ja: '〜だと強く感じる' },
      { en: 'I agree that', ja: '〜に賛成だ' },
      { en: 'I do not think that', ja: '〜だとは思わない' },
      { en: 'I think that', ja: '〜だと思う' },
      { en: 'From my point of view,', ja: '私の立場から見ると' },
      { en: 'I am convinced that', ja: '〜だと確信している' },
      { en: 'It seems to me that', ja: '私には〜のように思える' },
      { en: 'I disagree with the idea that', ja: '〜という考えに反対だ' },
      { en: 'I am in favor of', ja: '〜に賛成だ（後ろは名詞・-ing）' },
      { en: 'I am against', ja: '〜に反対だ（後ろは名詞・-ing）' },
    ],
  },
  {
    role: 'reason',
    title: '理由を並べる',
    phrases: [
      { en: 'First,', ja: 'まず' },
      { en: 'Second,', ja: '次に' },
      { en: 'Finally,', ja: '最後に' },
      { en: 'One reason is that', ja: '理由の 1 つは' },
      { en: 'Another reason is that', ja: 'もう 1 つの理由は' },
      { en: 'The main reason is that', ja: 'いちばんの理由は' },
      { en: 'First of all,', ja: 'まず第一に' },
      { en: 'To begin with,', ja: 'はじめに' },
      { en: 'Third,', ja: '3 つ目に' },
      { en: 'Next,', ja: '次に' },
      { en: 'Most importantly,', ja: 'いちばん大事なのは' },
      { en: 'This is because', ja: 'これは〜だからだ' },
      { en: 'because', ja: '〜なので' },
      { en: 'The first reason is that', ja: '1 つ目の理由は' },
    ],
  },
  {
    role: 'example',
    title: '例を挙げる',
    phrases: [
      { en: 'For example,', ja: 'たとえば' },
      { en: 'For instance,', ja: 'たとえば' },
      { en: 'In fact,', ja: '実際に' },
      { en: 'such as', ja: '〜のような' },
      { en: 'In my case,', ja: '私の場合' },
      { en: 'like', ja: '〜のような（くだけた言い方）' },
      { en: 'To give an example,', ja: '例を挙げると' },
      { en: 'A good example of this is', ja: 'このよい例は' },
      { en: 'In my experience,', ja: '私の経験では' },
      { en: 'When I was', ja: '私が〜だったとき' },
      { en: 'According to', ja: '〜によると' },
      { en: 'This means that', ja: 'これは〜ということだ' },
      { en: 'In other words,', ja: '言い換えると' },
    ],
  },
  {
    role: 'conclusion',
    title: '結論で締める',
    phrases: [
      { en: 'In conclusion,', ja: '結論として' },
      { en: 'For these reasons,', ja: 'これらの理由から' },
      { en: 'To sum up,', ja: 'まとめると' },
      { en: 'That is why', ja: 'だから' },
      { en: 'In short,', ja: '要するに' },
      { en: 'To conclude,', ja: '結論として' },
      { en: 'In summary,', ja: 'まとめると' },
      { en: 'All in all,', ja: '全体として' },
      { en: 'For all these reasons,', ja: 'これらすべての理由から' },
      { en: 'This is why I believe that', ja: 'これが〜だと思う理由だ' },
    ],
  },
  {
    role: null,
    title: 'つなぎ（transition words）',
    phrases: [
      { en: 'However,', ja: 'しかし' },
      { en: 'In addition,', ja: 'さらに' },
      { en: 'Also,', ja: 'また' },
      { en: 'As a result,', ja: 'その結果' },
      { en: 'On the other hand,', ja: '一方で' },
      { en: 'Therefore,', ja: 'したがって' },
      { en: 'Moreover,', ja: 'そのうえ' },
      { en: 'Furthermore,', ja: 'さらに' },
      { en: 'Besides,', ja: 'それに' },
      { en: 'So,', ja: 'だから' },
      { en: 'Because of this,', ja: 'このため' },
      { en: 'In contrast,', ja: '対照的に' },
      { en: 'Instead,', ja: 'その代わりに' },
      { en: 'Similarly,', ja: '同じように' },
      { en: 'In this way,', ja: 'このようにして' },
      { en: 'As a result of', ja: '〜の結果として' },
    ],
  },
  {
    role: null,
    title: '反対の意見にふれる',
    phrases: [
      { en: 'Some people say that', ja: '〜と言う人もいる' },
      { en: 'Some people may think that', ja: '〜と考える人もいるかもしれない' },
      { en: 'It is true that', ja: 'たしかに〜だ' },
      { en: 'Of course,', ja: 'もちろん' },
      { en: 'Although', ja: '〜だけれども' },
      { en: 'Even though', ja: '〜にもかかわらず' },
      { en: 'Still,', ja: 'それでも' },
      { en: 'Nevertheless,', ja: 'それにもかかわらず' },
    ],
  },
]
