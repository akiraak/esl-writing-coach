/**
 * 画面の文字（日本語）。英語（`en.ts`）はこれと同じ形にする（`Messages` を満たさないと型チェックで落ちる）。
 * 値は文字列か、引数を取って文字列を返す関数（語順・単数複数の違いを関数の中で吸収する）。
 *
 * 画面ごとに節を分ける（`docs/plans/archive/ui-english.md`）。AI の答え・ユーザーが書いたもの・AI のプロンプトで使う名前はここに置かない。
 */
/** 数えるもの（語数・文数）。 */
export type CountKind = 'words' | 'sentences'

const UNIT: Readonly<Record<CountKind, string>> = { words: '語', sentences: '文' }

export const ja = {
  /** `index.html` の読み込み中と同じ。 */
  loading: '読み込み中…',

  lang: {
    /** 切り替えのまとまりの名前（読み上げ用）。 */
    group: '表示の言語',
    /** 切り替える前に保存できなかった分があるとき。 */
    unsavedConfirm:
      '保存できていない変更があります。表示の言語を切り替えると、画面を作り直すので手元の変更が消えます。切り替えますか？',
  },

  header: {
    review: '振り返り',
    guide: '学習ガイド',
    toList: 'パラグラフ一覧へ',
    /** 書き出しのダイアログを開く（編集画面）。 */
    export: '書き出し',
  },

  /** 段階の名前（タイル・見出し・次のステップへのボタン）。 */
  stages: {
    assignment: '課題',
    outline: 'アウトライン',
    draft: '下書き・推敲',
  },
  /** 一覧のカードの進み具合に添える短い名前（幅が狭いので）。 */
  stagesShort: {
    assignment: '課題',
    outline: 'アウトライン',
    draft: '下書き',
  },

  /** ヘッダの保存の状態と、段階のタイルの保存の印。 */
  save: {
    saved: '保存済み',
    savedAt: (time: string) => `✓ 保存済み ${time}`,
    dirty: '未保存',
    saving: '保存中…',
    failed: '保存できません',
    retry: '再試行',
    stopped: '自動保存を停止',
    markDirty: '未保存',
    markSaving: '保存中',
    markFailed: (message: string) => `保存できません: ${message}`,
    markConflict: '競合',
    markConflictTitle: '他で更新されています（自動保存を止めました）',
  },

  list: {
    title: 'パラグラフ',
    create: '＋ 新規作成',
    newCard: '＋ 新しいパラグラフ',
    empty: 'まだパラグラフはありません。',
    updated: (date: string) => `更新 ${date}`,
    scored: (date: string) => `採点 ${date}`,
    staleScore: '採点後に変更あり',
    remove: '削除',
    removing: '削除中…',
    removeConfirm: (title: string) =>
      `「${title}」を削除しますか？\n\n一覧から消します（DB には印を付けて残すので、手で戻せます）。`,
    removeFailed: (message: string) => `削除できません: ${message}`,
    dialogTitle: '新しいパラグラフ',
    theme: 'テーマ',
    themeHint:
      '自分で決めたテーマ（問い）。英語でも日本語でもよい。空のままでも作れ、あとで課題の画面で入れられる。',
    submit: '作成',
    submitting: '作成中…',
    cancel: 'やめる',
    createFailed: (message: string) => `作成できません: ${message}`,
  },

  /** 語数・文数（課題の指定・タイルの状態の行・メーター・帯）。 */
  counts: {
    /** 課題のフォームの行の名前。 */
    label: { words: '語数', sentences: '文数' } as Record<CountKind, string>,
    /** 数のあとの単位（メーター・課題のフォーム）。 */
    unit: (_n: number, kind: CountKind) => UNIT[kind],
    count: (n: number, kind: CountKind) => `${n} ${UNIT[kind]}`,
    between: (min: number, max: number, kind: CountKind) => `${min}–${max} ${UNIT[kind]}`,
    atLeast: (n: number, kind: CountKind) => `${n} ${UNIT[kind]}以上`,
    atMost: (n: number, kind: CountKind) => `${n} ${UNIT[kind]}以下`,
    none: '指定なし',
    /** メーター。 */
    inRange: '範囲内',
    short: (n: number, kind: CountKind) => `あと ${n} ${UNIT[kind]}`,
    over: (n: number, kind: CountKind) => `${n} ${UNIT[kind]}多い`,
  },

  /** 段階のタイルの状態の行（`stage-summary.ts`）。 */
  summary: {
    notStarted: '未着手',
    reasons: (n: number) => `理由 ${n}`,
    items: (n: number) => `${n} 項目`,
  },

  /** 編集画面の枠（`views/edit.ts`）。 */
  edit: {
    /** 段階のタイルの言語の印。 */
    langJa: '日本語可',
    langEn: '英語のみ',
    openLeft: '段階の一覧（左ペイン）を開く',
    closeLeft: '段階の一覧（左ペイン）を閉じて、中央を広げる',
    /** 下書きの画面の右の列の書き出し。 */
    exportNext: '書き出し →',
    nextStep: (n: number, stage: string) => `STEP ${n} ${stage}へ →`,
    /** 採点・翻訳・質問の前に保存し終えられなかったとき。 */
    prepare: {
      loading: '読み込み中です',
      docs: { draft: '下書き', title: 'タイトル' },
      actions: { score: '採点', translate: '翻訳', ask: '質問' },
      conflict: (doc: string, action: string) =>
        `${doc}が他で更新されています（自動保存を止めています）。読み直してから${action}してください`,
      unsaved: (doc: string, action: string) =>
        `${doc}を保存できていません。保存できてから${action}してください`,
    },
  },

  /** 競合の知らせ（`stage-editor.ts`）。 */
  conflict: {
    title: '他の端末（または別のタブ）で更新されています。',
    body: ' 上書きしないよう、この段階の自動保存を止めました。手元の変更は画面に残っています。',
    copy: '手元の内容をコピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできません',
    reload: '読み直す（手元の変更は捨てる）',
    reloadConfirm: '手元の変更を捨てて、保存されている内容を読み直しますか？',
  },

  /** STEP 1 課題（`views/assignment.ts`）。 */
  assignment: {
    theme: 'テーマ',
    themeHint: '自分で決めたテーマ（問い）。英語でも日本語でもよい。',
    counts: '語数・文数の指定',
    countsHint:
      '下限〜上限。片方だけでもよい。「約 150 語」のような指定は 140〜160 のように幅に直して入れる。',
    min: (label: string) => `${label}の下限`,
    max: (label: string) => `${label}の上限`,
    reversed: '下限が上限より大きくなっています',
    conditions: '構成や表現の条件',
    conditionsPlaceholder:
      '例: 理由を 3 つ挙げ、First / Second / Finally を使う。結論で topic sentence を言い換える。',
    conditionsHint: '授業で出された条件をそのまま書く（日本語でよい）。下書きの画面の上に出る。',
  },

  /** 課題のテーマと条件の帯（`views/brief.ts`）。 */
  brief: {
    noTheme: 'テーマがまだありません。',
    toAssignment: '課題で入れる',
    conditions: '課題の条件',
    /** 語数と文数の指定の間。 */
    separator: ' ・ ',
  },

  /** STEP 2 アウトライン（`views/outline.ts`）。 */
  outline: {
    /** 問いの行の頭に出す役割（早見と同じ言葉）。 */
    roles: { topic: '意見', reason: '理由', example: '例・詳細', conclusion: '結論' },
    legend: {
      center: '中心',
      centerRole: '意見（topic sentence の元）',
      child: '子',
      childRole: '理由',
      grandchild: '孫',
      grandchildRole: '例・詳細',
      last: '最後',
      lastRole: '結論',
    },
    checks: '型のチェック',
    /** 問いの「次にすること」の頭。 */
    next: '次に → ',
    /** テーマが空のときの仮の中心の名前。 */
    centerTitle: '意見',
    centerPlaceholder: '意見（topic sentence の元）',
  },

  /** 型のチェック（`outline-checks.ts`）。 */
  outlineChecks: {
    oneTopic: '意見（中心）が 1 つ',
    noTopic: '中心に意見を書こう。',
    manyTopics: (n: number) => `意見が ${n} つあります（字下げ 0 の行が複数）。1 つにまとめよう。`,
    reasons: (min: number, max: number) => `理由が ${min}〜${max} つ`,
    fewReasons: (n: number) => `理由が ${n} つです。中心の子として理由を足そう。`,
    manyReasons: (n: number) =>
      `理由が ${n} つです。説得力のあるものに絞ろう（課題の指定があればそれに合わせる）。`,
    examples: 'どの理由にも例・詳細',
    noReasons: '理由を書いたら、その子として例・詳細を足そう。',
    bareReasons: (list: string) => `例・詳細の無い理由: ${list}`,
    conclusion: '結論',
    noConclusion: '中心の最後の子として「結論: …」を足そう。',
  },

  /** 選んでいる項目に合わせた問い（`outline-prompts.ts`）。 */
  outlinePrompts: {
    write: {
      topic: 'テーマへの答え（賛成か反対か）を 1 文で',
      reason: '意見を支える理由（なぜそう思う？）を短く',
      example: '理由を支える具体例（体験・数字・場面）',
      conclusion: '意見を別の言い方で言い直す（新しい理由は足さない）',
    },
    empty: 'まず中心に、テーマへの答え（賛成か反対か）を 1 文で書く',
    manyTopics: (n: number) => `意見（字下げ 0 の項目）が ${n} つあります`,
    mergeTopics: '意見は 1 つにまとめ、ほかは理由や例としてその下に入れる',
    addReason: 'なぜそう思う？ 理由を子に足す（Tab）',
    addConclusion: '理由がそろったら、最後の子に「結論: …」を足す',
    checkTopic: '意見はテーマの問いにはっきり答えている？',
    addSiblingReason: 'ほかの理由は兄弟に足す（Enter）',
    addExample: 'たとえば？ 体験・数字・場面を子に足す（Tab）',
    moreConcrete: 'もっと具体的に言える？（いつ・どこで・誰が・いくら）',
    toDraft: '仕上がったら「STEP 3 下書き・推敲へ」',
  },

  /** マインドマップ（`map.ts`）。 */
  map: {
    tree: 'マインドマップ',
    input: 'ノードの名前（Shift+Enter で改行）',
    toolbar: 'マップの操作',
    /** 新しく足すノードを並べるときの仮の名前（本文には書かない）。 */
    draftLabel: '新しい枝',
    addChild: '＋子',
    addChildTip: '子を足す（Tab）',
    addSibling: '＋兄弟',
    addSiblingTip: '兄弟を足す（Enter）',
    rename: '名前',
    renameTip: '名前を変える（Space・F2・ダブルクリック）',
    remove: '削除',
    removeTip: '消す（Delete）',
    fold: '畳む',
    unfold: '開く',
    foldTip: '畳む・開く（Ctrl+↑ / Ctrl+↓）',
    undoTip: '元に戻す（Ctrl+Z）',
    redoTip: 'やり直す（Ctrl+Shift+Z）',
    zoomOutTip: '縮小（Ctrl+-）',
    zoomInTip: '拡大（Ctrl++）',
    hint: 'Tab: 子 / Enter: 兄弟 / Space: 名前 / Delete: 消す / Alt+矢印・ドラッグ: 付け替え / Ctrl+↑↓: 畳む・開く / Ctrl+C・X・V: 枝のコピー',
  },

  /** STEP 3 下書き・推敲（`views/draft.ts`）。 */
  draft: {
    japaneseInBody: '日本語が混じっています。下書きは英語だけで書きます。',
    japaneseInTitle: 'タイトルに日本語が混じっています。タイトルも英語で書きます。',
    titleLabel: 'タイトル（英語）',
    titleTip: 'タイトル（提出用のファイルの中央のタイトルになる。語数・文数には数えない）',
    bodyLabel: '下書きの本文（英語）',
    openOutline: 'アウトラインを開く',
    closeOutline: 'アウトラインを右に閉じて、本文の欄を広げる',
    outline: 'アウトライン',
    readOnly: '見るだけ',
    outlineLabel: 'アウトライン（見るだけ）',
    noOutline: 'アウトラインはまだありません。',
    toOutline: 'STEP 2 で作る',
  },

  /** 書き出しのダイアログ（`export-dialog.ts`）。 */
  exportDialog: {
    title: '書き出し',
    meta: (words: number, sentences: number) =>
      `${words} 語 ・ ${sentences} 文（タイトルは数えません）`,
    empty: '下書きがまだ空です。',
    japanese: '日本語が混じっています。下書きは英語だけで書きます。',
    noTitle: 'タイトルがまだありません（STEP 3 のタイトルの欄）。タイトルなしで書き出します。',
    name: '名前',
    klass: 'クラス',
    date: '日付',
    submission: '提出用のファイル',
    submissionHint:
      '左上に名前・クラス・日付（入れたものだけ）、1 行空けて中央にタイトル（課題のテーマは出しません）。A4・Times New Roman 12pt・行間 2 行。PDF は印刷の画面で「PDF に保存」を選ぶ。',
    docx: '.docx で保存',
    pdf: 'PDF（印刷）',
    plain: 'プレーンテキスト',
    plainHint: 'タイトルがあれば 1 行目に入れ、1 行空けて本文。',
    copy: 'テキストをコピー',
    txt: '.txt で保存',
    close: '閉じる',
    saved: (file: string) => `${file} を保存しました`,
    copied: 'コピーしました',
    copyFailed: 'コピーできません',
  },

  /** 右ペインの幅を変える境（`pane-resizer.ts`）。 */
  resizer: {
    label: '右ペインの幅',
    tip: 'ドラッグで右ペインの幅を変える（ダブルクリックで戻す・← → でも動く）',
  },

  /** 右ペイン（AI）の枠（`ai-pane.ts`・`src/shared/ai-tools.ts`）。 */
  ai: {
    title: 'AI',
    subtitle: '押したときだけ呼びます',
    /** 機能の名前（カードの見出し・「ほかの段階の AI」の行）。 */
    tools: {
      themes: 'テーマの候補',
      ideas: '理由・例の候補',
      outline: 'アウトラインの指摘',
      chat: 'AI に質問',
      translate: '日本語訳',
      score: '採点',
    },
    /** STEP 3 のタブ。 */
    tabs: { ai: 'AI', translate: '翻訳', score: '採点' },
    /** 使う段階の短い印（`STEP 1・2`）。 */
    steps: (steps: readonly number[]) => `STEP ${steps.join('・')}`,
    stepTitle: (n: number, stage: string) => `STEP ${n} ${stage}で使う AI`,
    others: 'ほかの段階の AI',
    foot: '押したときだけ、各欄の「送るもの」を Anthropic の API に送ります。AI案に質問すると、その結果とそれまでの質問も送ります。結果と質問はパラグラフごとに最新の 1 回分を残します（「AI に質問」のやりとりは「はじめから」で消すまで）。',
    notYet: 'まだ',
    when: '出した日時',
    sends: (what: string) => `送るもの: ${what}`,
    noApiKey: 'ANTHROPIC_API_KEY が設定されていません。.env に入れてサーバを起動し直すと使えます。',
  },

  /** AI案の 3 つのカード（`ideas-pane.ts`）。 */
  ideas: {
    failed: (message: string) => `出せませんでした: ${message}`,
    loadFailed: (message: string) => `前に出した AI案を読めません: ${message}`,
    thinking: '考えています…',
    hintPlaceholder: '分野・キーワード（任意）例: 部活、スマホ、環境',
    hintLabel: 'テーマの分野・キーワード',
    themesButton: 'テーマの候補を出す',
    useTheme: '課題のテーマにする',
    currentTheme: '今のテーマです',
    themesDesc: '分野・キーワードから、英語の問いと日本語訳を出します。',
    themesSends: '分野・キーワード',
    ideasButton: '理由・例の候補を出す',
    ideasSummary: '理由と例を見る',
    ideasSummaryCount: (counts: string) => `理由と例を見る（${counts}）`,
    stance: { for: '賛成', against: '反対' },
    stanceCount: (stance: string, n: number) => `${stance} ${n}`,
    stanceSeparator: '・',
    theme: (theme: string) => `テーマ: ${theme}`,
    noTheme: '課題のテーマを入れると出せます。',
    ideasStale: '課題のテーマか条件を変える前に出した候補です。',
    ideasDesc:
      '賛成・反対それぞれの理由と例（日本語）。見るだけ。使えそうなものは自分の言葉でアウトラインに足す。',
    ideasSends: '課題のテーマ・条件',
    reviewButton: 'アウトラインを見てもらう',
    reviewing: '見ています…',
    noFindings: '大きな指摘はありません。',
    noOutline: 'アウトラインを作ると見てもらえます。',
    reviewDesc:
      '意見・理由・例・結論のつながりを見て、直すところをヒントで返します（直した項目は出しません）。',
    reviewStale: 'アウトラインか課題を直す前の指摘です。もう一度見てもらえます。',
    reviewSends: '課題のテーマ・条件・アウトライン',
  },

  /** AI案への質問の欄（`ai-questions.ts`）。 */
  questions: {
    answering: '答えています…',
    ask: '質問する',
    older: (n: number) => `前の質問（${n}）`,
    failed: (message: string) => `答えを出せませんでした: ${message}`,
    stale: '前のテーマ・アウトラインについての質問になります。',
    placeholder: 'この結果について質問する（日本語で。Ctrl+Enter で送る）',
    label: 'AI案への質問',
    full: (max: number) => `質問は ${max} 回までです。AI案を出し直すと新しく聞けます。`,
  },

  /** STEP 3 の「AI に質問」（`draft-chat-pane.ts`）。 */
  draftChat: {
    reset: 'はじめから',
    count: (n: number, max: number) => `${n} / ${max} 回（前のやりとりも送ります）`,
    placeholder: '英語や下書きについて質問（Ctrl+Enter で送る）',
    label: 'AI に質問',
    full: (max: number) => `質問は ${max} 回までです。「はじめから」で消すと新しく聞けます。`,
    resetConfirm: '「AI に質問」のやりとりを全部消して、はじめから聞き直しますか？',
    clearFailed: (message: string) => `消せませんでした: ${message}`,
    loadFailed: (message: string) => `前のやりとりを読めません: ${message}`,
    desc: '語・文法・表現の違い、下書きのこの文は合っているか、書き方など、自由に聞けます。答えには英文（直した文・例文）も出ます。',
    sends: '下書き・タイトル・課題・語数と文数・質問',
  },

  /** 下書きの日本語訳（`translation-pane.ts`）。 */
  translation: {
    button: '日本語に訳す',
    again: 'もう一度訳す',
    busy: '訳しています…',
    slow: '数秒〜30 秒ほどかかります。',
    noDraft: '下書きを書くと訳せます。',
    desc: '下書きを文ごとに、直訳に近い日本語にします。言いたいことが英語で伝わっているかを確かめられます（誤りは直さずに、書いてあるとおりに訳します）。',
    stale: '訳した後に本文かタイトルが変わっています。もう一度訳すと今の本文の訳になります。',
    none: 'まだ訳していません。',
    missing: '（訳がありません。もう一度訳してください）',
    title: 'タイトル',
    failed: (message: string) => `訳せませんでした: ${message}`,
    loadFailed: (message: string) => `訳を読めません: ${message}`,
    sends: '下書き・タイトル',
  },

  /** 採点（`feedback-pane.ts`）。観点の名前は振り返りでも使う。 */
  feedback: {
    button: '採点する',
    again: 'もう一度採点する',
    busy: '採点中…',
    slow: '30 秒〜1 分ほどかかります。',
    noDraft: '下書きを書くと採点できます。',
    desc: '100 点満点と観点ごとの点数、綴りの誤りの一覧、直すところのヒントと修正例の英文。',
    stale: '採点した後に本文かタイトルが変わっています。直したらもう一度採点できます。',
    none: 'まだ採点していません。',
    summary: '採点の結果を見る',
    summaryTotal: (total: number) => `採点の結果を見る（${total} 点）`,
    strengths: 'よかった点',
    spellings: (n: number) => `綴りの誤り（${n}）`,
    findings: (n: number) => `直すところ（${n}）`,
    noFindings: '大きな指摘はありません。',
    fix: '修正例',
    failed: (message: string) => `採点できませんでした: ${message}`,
    loadFailed: (message: string) => `採点の結果を読めません: ${message}`,
    sends: '下書き・タイトル・課題・語数と文数',
    /** 観点の名前（AI に渡すプロンプトの名前は `src/shared/feedback.ts` の `CRITERIA` のまま）。 */
    criteria: {
      structure: '構成',
      content: '内容',
      grammar: '文法',
      vocabulary: '語彙・表現',
      requirements: '課題の条件',
    },
  },

  /** 学習ガイドの枠（`guide-content.ts`・`guide-pane.ts`・`views/guide.ts`）。中身は `src/shared/guide.ts`。 */
  guide: {
    pageTitle: 'Opinion paragraph の書き方',
    /** タブの名前（`short` は引き出しの狭い幅のとき）。 */
    tabs: {
      structure: { label: '構成の解説', short: '構成' },
      model: { label: 'モデル文', short: 'モデル文' },
      phrases: { label: '表現集', short: '表現集' },
    },
    flow: '並び:',
    stats: (words: number, sentences: number) => `${words} 語 ・ ${sentences} 文`,
    modelOutline: 'このモデル文のアウトライン（STEP 2 の見本）',
    points: '書き方のポイント',
    insertTip: '下書きのカーソルの位置に入れる',
    openDraft: '下書き（STEP 3）を開くと、押して本文に入れられます。',
    insertHint: '押すと下書きのカーソルの位置に入ります。',
    viewOnlyHint: 'STEP 3（下書き）で押すと本文に入ります。ここでは見るだけ。',
    recommended: 'この段階のおすすめ',
    recommendedLabel: '（おすすめ）',
    close: '閉じる',
    closeLabel: '学習ガイドを閉じる',
    toPage: '別の画面で開く',
    toPageTip: '学習ガイドの画面へ移る',
  },

  /** 間違いの振り返り（`views/review.ts`）。観点の名前は `feedback.criteria`。 */
  review: {
    title: '間違いの振り返り',
    lead: 'パラグラフごとの最新の採点を集めています（採点は最新の 1 回分だけを持つので、採点し直すと前の結果と入れ替わります）。',
    empty:
      'まだ採点したパラグラフがありません。下書き（STEP 3）の右ペインの「採点」で採点すると、ここに集まります。',
    count: '採点したパラグラフ',
    average: '合計の平均',
    weakest: '伸ばしたいところ',
    weakestAverage: (percent: number) => ` 平均 ${percent}%`,
    criteria: '観点ごとの平均',
    barValue: (average: string, max: number, percent: number) =>
      `${average} / ${max}（${percent}%）`,
    timeline: '点数の推移',
    timelineNote: '採点した日の古い順。テーマを押すとその下書きを開きます。',
    date: '採点した日',
    theme: 'テーマ',
    total: '合計',
    column: (label: string, max: number) => `${label}（${max}）`,
    mistakes: 'よくする間違い',
    mistakesNote: '観点ごとの指摘（指摘の多い観点から。各観点の中は新しい採点から）。',
    items: (n: number) => `${n} 件`,
    noFindings: '指摘はありません。',
    scoredOn: (date: string) => ` ・ ${date}`,
  },

  notFound: {
    message: (hash: string) => `ページがありません（${hash}）。`,
    toList: '一覧へ',
  },

  errors: {
    loadFailed: (message: string) => `読み込めません: ${message}`,
    /**
     * サーバのエラーのコード（`src/server/api.ts`・`guard.ts`）ごとの文。ここに無いコードはサーバの `message` をそのまま出す。
     * `ai_error` は API の失敗の中身を後ろに添える（`apiErrorText`）。
     */
    codes: {
      conflict: '他の端末（または別のタブ）で更新されています',
      not_found: '見つかりません（削除されたかもしれません）',
      bad_id: 'パラグラフの id が不正です',
      bad_json: '送った内容を読めませんでした',
      bad_stage: '段階が不正です',
      bad_text: '本文が不正です',
      bad_rev: '版の番号が不正です',
      bad_theme: 'テーマが不正です',
      bad_kind: 'AI案の種類が不正です',
      bad_question: '質問が空です',
      empty_theme: 'テーマが空です',
      empty_draft: '下書きが空です',
      empty_outline: 'アウトラインが空です',
      no_result: 'まだ AI案を出していません',
      too_many_questions: '質問できる回数の上限に達しました',
      result_changed: 'AI案が出し直されたので、質問は残していません',
      chat_changed: 'やりとりが変わったので、質問は残していません',
      too_large: '本文が大きすぎます',
      method_not_allowed: '使えない操作です',
      forbidden: 'リクエストが拒否されました',
      ai_not_configured: 'ANTHROPIC_API_KEY が設定されていません',
      ai_refusal: 'AI が答えるのを断りました',
      ai_error: 'AI の呼び出しに失敗しました',
      internal: 'サーバの内部エラーです',
    },
  },
}

export type Messages = typeof ja
