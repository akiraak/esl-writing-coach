import type { CountKind, Messages } from './ja.js'

/** `1 word` / `2 words`。 */
const unit = (n: number, kind: CountKind) =>
  n === 1 ? (kind === 'words' ? 'word' : 'sentence') : kind
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** 画面の文字（英語）。形は `ja.ts` と同じ。 */
export const en: Messages = {
  loading: 'Loading…',

  lang: {
    group: 'Display language',
    unsavedConfirm:
      'Some changes could not be saved. Switching the language rebuilds the screen, and your unsaved changes will be lost. Switch anyway?',
  },

  header: {
    review: 'Review',
    guide: 'Guide',
    toList: 'All paragraphs',
    export: 'Export',
  },

  stages: {
    assignment: 'Assignment',
    outline: 'Outline',
    draft: 'Draft & revise',
  },
  stagesShort: {
    assignment: 'Assignment',
    outline: 'Outline',
    draft: 'Draft',
  },

  save: {
    saved: 'Saved',
    savedAt: (time: string) => `✓ Saved ${time}`,
    dirty: 'Unsaved',
    saving: 'Saving…',
    failed: 'Could not save',
    retry: 'Retry',
    stopped: 'Autosave stopped',
    markDirty: 'Unsaved',
    markSaving: 'Saving',
    markFailed: (message: string) => `Could not save: ${message}`,
    markConflict: 'Conflict',
    markConflictTitle: 'Updated elsewhere (autosave stopped)',
  },

  list: {
    title: 'Paragraphs',
    create: '+ New',
    newCard: '+ New paragraph',
    empty: 'No paragraphs yet.',
    updated: (date: string) => `Updated ${date}`,
    scored: (date: string) => `Scored ${date}`,
    staleScore: 'Changed since scoring',
    remove: 'Delete',
    removing: 'Deleting…',
    removeConfirm: (title: string) =>
      `Delete "${title}"?\n\nIt will disappear from the list (it stays marked in the database, so it can be restored by hand).`,
    removeFailed: (message: string) => `Could not delete: ${message}`,
    dialogTitle: 'New paragraph',
    theme: 'Topic',
    themeHint:
      'A topic (question) you choose. English or Japanese is fine. You can leave it empty and fill it in later on the Assignment step.',
    submit: 'Create',
    submitting: 'Creating…',
    cancel: 'Cancel',
    createFailed: (message: string) => `Could not create: ${message}`,
  },

  counts: {
    label: { words: 'Words', sentences: 'Sentences' },
    unit,
    count: (n: number, kind: CountKind) => `${n} ${unit(n, kind)}`,
    between: (min: number, max: number, kind: CountKind) => `${min}–${max} ${kind}`,
    atLeast: (n: number, kind: CountKind) => `${n}+ ${unit(n, kind)}`,
    atMost: (n: number, kind: CountKind) => `up to ${n} ${unit(n, kind)}`,
    none: 'No limit',
    inRange: 'In range',
    short: (n: number, kind: CountKind) => `${n} more ${unit(n, kind)}`,
    over: (n: number, kind: CountKind) => `${n} ${unit(n, kind)} over`,
  },

  summary: {
    notStarted: 'Not started',
    reasons: (n: number) => plural(n, 'reason', 'reasons'),
    items: (n: number) => plural(n, 'item', 'items'),
  },

  edit: {
    langJa: 'Japanese OK',
    langEn: 'English only',
    openLeft: 'Show the steps (left pane)',
    closeLeft: 'Hide the steps (left pane) to widen the center',
    exportNext: 'Export →',
    nextStep: (n: number, stage: string) => `STEP ${n} ${stage} →`,
    prepare: {
      loading: 'Still loading',
      docs: { draft: 'draft', title: 'title' },
      actions: { score: 'scoring', translate: 'translating', ask: 'asking' },
      conflict: (doc: string, action: string) =>
        `The ${doc} was updated elsewhere (autosave is stopped). Reload it before ${action}.`,
      unsaved: (doc: string, action: string) =>
        `The ${doc} has not been saved. Wait until it is saved before ${action}.`,
    },
  },

  conflict: {
    title: 'This was updated on another device (or in another tab).',
    body: ' To avoid overwriting it, autosave for this step has been stopped. Your changes are still on the screen.',
    copy: 'Copy my version',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    reload: 'Reload (discard my changes)',
    reloadConfirm: 'Discard your changes and reload the saved version?',
  },

  assignment: {
    theme: 'Topic',
    themeHint: 'A topic (question) you choose. English or Japanese is fine.',
    counts: 'Word and sentence counts',
    countsHint:
      'Minimum to maximum. You can fill in just one. For "about 150 words", enter a range such as 140 to 160.',
    min: (label: string) => `${label}: minimum`,
    max: (label: string) => `${label}: maximum`,
    reversed: 'The minimum is larger than the maximum',
    conditions: 'Structure and language requirements',
    conditionsPlaceholder:
      'e.g. Give three reasons and use First / Second / Finally. Restate the topic sentence in the conclusion.',
    conditionsHint:
      'Write the requirements from class as they are (Japanese is fine). They appear above the draft.',
  },

  brief: {
    noTheme: 'No topic yet.',
    toAssignment: 'Add it in the Assignment step',
    conditions: 'Requirements',
    separator: ' · ',
  },

  outline: {
    roles: { topic: 'Opinion', reason: 'Reason', example: 'Example', conclusion: 'Conclusion' },
    legend: {
      center: 'Center',
      centerRole: 'Opinion (basis of the topic sentence)',
      child: 'Child',
      childRole: 'Reason',
      grandchild: 'Grandchild',
      grandchildRole: 'Example / detail',
      last: 'Last',
      lastRole: 'Conclusion',
    },
    checks: 'Structure check',
    next: 'Next → ',
    centerTitle: 'Opinion',
    centerPlaceholder: 'Opinion (basis of the topic sentence)',
  },

  outlineChecks: {
    oneTopic: 'One opinion (center)',
    noTopic: 'Write your opinion in the center.',
    manyTopics: (n: number) =>
      `There are ${n} opinions (several lines with no indent). Combine them into one.`,
    reasons: (min: number, max: number) => `${min}–${max} reasons`,
    fewReasons: (n: number) =>
      `${plural(n, 'reason', 'reasons')} so far. Add reasons as children of the center.`,
    manyReasons: (n: number) =>
      `${plural(n, 'reason', 'reasons')}. Keep the most convincing ones (follow the assignment if it says how many).`,
    examples: 'An example for every reason',
    noReasons: 'After writing a reason, add an example or detail as its child.',
    bareReasons: (list: string) => `Reasons without an example: ${list}`,
    conclusion: 'Conclusion',
    noConclusion: 'Add "Conclusion: …" as the last child of the center.',
  },

  outlinePrompts: {
    write: {
      topic: 'Your answer to the topic (for or against) in one sentence',
      reason: 'A short reason that supports your opinion (why do you think so?)',
      example: 'A concrete example for the reason (experience, numbers, a scene)',
      conclusion: 'Restate your opinion in other words (no new reasons)',
    },
    empty: 'Start by writing your answer to the topic (for or against) in the center',
    manyTopics: (n: number) => `There are ${n} opinions (items with no indent)`,
    mergeTopics: 'Keep one opinion and move the others under it as reasons or examples',
    addReason: 'Why do you think so? Add a reason as a child (Tab)',
    addConclusion: 'Once you have your reasons, add "Conclusion: …" as the last child',
    checkTopic: 'Does your opinion clearly answer the topic question?',
    addSiblingReason: 'Add other reasons as siblings (Enter)',
    addExample: 'For example? Add an experience, numbers or a scene as a child (Tab)',
    moreConcrete: 'Can you be more specific? (when, where, who, how much)',
    toDraft: 'When it is ready, go to "STEP 3 Draft & revise"',
  },

  map: {
    tree: 'Mind map',
    input: 'Node name (Shift+Enter for a new line)',
    toolbar: 'Map actions',
    draftLabel: 'New branch',
    addChild: '+ Child',
    addChildTip: 'Add a child (Tab)',
    addSibling: '+ Sibling',
    addSiblingTip: 'Add a sibling (Enter)',
    rename: 'Rename',
    renameTip: 'Rename (Space, F2, double-click)',
    remove: 'Delete',
    removeTip: 'Delete (Delete)',
    fold: 'Fold',
    unfold: 'Unfold',
    foldTip: 'Fold / unfold (Ctrl+↑ / Ctrl+↓)',
    undoTip: 'Undo (Ctrl+Z)',
    redoTip: 'Redo (Ctrl+Shift+Z)',
    zoomOutTip: 'Zoom out (Ctrl+-)',
    zoomInTip: 'Zoom in (Ctrl++)',
    hint: 'Tab: child / Enter: sibling / Space: rename / Delete: delete / Alt+arrows, drag: move / Ctrl+↑↓: fold / Ctrl+C, X, V: copy a branch',
  },

  draft: {
    japaneseInBody: 'Your draft contains Japanese. Write the draft in English only.',
    japaneseInTitle: 'Your title contains Japanese. Write the title in English too.',
    titleLabel: 'Title (English)',
    titleTip: 'Title (shown centered in the submission file; not counted in words or sentences)',
    bodyLabel: 'Draft text (English)',
    openOutline: 'Show the outline',
    closeOutline: 'Hide the outline to widen the text area',
    outline: 'Outline',
    readOnly: 'read-only',
    outlineLabel: 'Outline (read-only)',
    noOutline: 'No outline yet.',
    toOutline: 'Make one in STEP 2',
  },

  exportDialog: {
    title: 'Export',
    meta: (words: number, sentences: number) =>
      `${plural(words, 'word', 'words')} · ${plural(sentences, 'sentence', 'sentences')} (title not counted)`,
    empty: 'The draft is still empty.',
    japanese: 'The draft contains Japanese. Write the draft in English only.',
    noTitle: 'No title yet (the title field in STEP 3). It will be exported without a title.',
    name: 'Name',
    klass: 'Class',
    date: 'Date',
    submission: 'Submission file',
    submissionHint:
      'Name, class and date at the top left (only those you fill in), then a blank line and the title centered (the assignment topic is not included). A4, Times New Roman 12pt, double-spaced. For a PDF, choose "Save as PDF" in the print dialog.',
    docx: 'Save as .docx',
    pdf: 'PDF (print)',
    plain: 'Plain text',
    plainHint: 'The title (if any) on the first line, then a blank line and the text.',
    copy: 'Copy text',
    txt: 'Save as .txt',
    close: 'Close',
    saved: (file: string) => `Saved ${file}`,
    copied: 'Copied',
    copyFailed: 'Could not copy',
  },

  resizer: {
    label: 'Right pane width',
    tip: 'Drag to change the width of the right pane (double-click to reset, or use ← →)',
  },

  ai: {
    title: 'AI',
    subtitle: 'Runs only when you press a button',
    tools: {
      themes: 'Topic ideas',
      ideas: 'Reasons & examples',
      outline: 'Outline feedback',
      chat: 'Ask AI',
      translate: 'Japanese translation',
      score: 'Score',
    },
    tabs: { ai: 'AI', translate: 'Translate', score: 'Score' },
    steps: (steps: readonly number[]) => `STEP ${steps.join(', ')}`,
    stepTitle: (n: number, stage: string) => `AI for STEP ${n} ${stage}`,
    others: 'AI for other steps',
    foot: 'Only when you press a button, the items listed under "Sends" are sent to the Anthropic API. Asking about an AI suggestion also sends that result and your earlier questions. The latest result and questions are kept for each paragraph ("Ask AI" conversations are kept until you press "Start over").',
    notYet: 'Not yet',
    when: 'Created at',
    sends: (what: string) => `Sends: ${what}`,
    noApiKey: 'ANTHROPIC_API_KEY is not set. Add it to .env and restart the server to use this.',
  },

  ideas: {
    failed: (message: string) => `Could not get suggestions: ${message}`,
    loadFailed: (message: string) => `Could not load earlier AI suggestions: ${message}`,
    thinking: 'Thinking…',
    hintPlaceholder: 'Field or keywords (optional) e.g. club activities, smartphones',
    hintLabel: 'Field or keywords for the topic',
    themesButton: 'Suggest topics',
    useTheme: 'Use as the topic',
    currentTheme: 'Current topic',
    themesDesc: 'Suggests English questions with Japanese translations from a field or keywords.',
    themesSends: 'field, keywords',
    ideasButton: 'Suggest reasons & examples',
    ideasSummary: 'Show reasons and examples',
    ideasSummaryCount: (counts: string) => `Show reasons and examples (${counts})`,
    stance: { for: 'For', against: 'Against' },
    stanceCount: (stance: string, n: number) => `${stance} ${n}`,
    stanceSeparator: ', ',
    theme: (theme: string) => `Topic: ${theme}`,
    noTheme: 'Enter the assignment topic to use this.',
    ideasStale: 'These were suggested before you changed the topic or requirements.',
    ideasDesc:
      'Reasons and examples for and against (in Japanese). For reference only: add useful ones to your outline in your own words.',
    ideasSends: 'topic, requirements',
    reviewButton: 'Review my outline',
    reviewing: 'Reviewing…',
    noFindings: 'No major issues.',
    noOutline: 'Make an outline to get feedback.',
    reviewDesc:
      'Checks how the opinion, reasons, examples and conclusion connect, and gives hints on what to fix (no rewritten items).',
    reviewStale:
      'This feedback is from before you changed the outline or assignment. You can ask again.',
    reviewSends: 'topic, requirements, outline',
  },

  questions: {
    answering: 'Answering…',
    ask: 'Ask',
    older: (n: number) => `Earlier questions (${n})`,
    failed: (message: string) => `Could not get an answer: ${message}`,
    stale: 'Your question will be about the earlier topic or outline.',
    placeholder: 'Ask in Japanese (Ctrl+Enter to send)',
    label: 'Question about the AI suggestion',
    full: (max: number) =>
      `You can ask up to ${max} questions. Regenerate the suggestions to ask again.`,
  },

  draftChat: {
    reset: 'Start over',
    count: (n: number, max: number) => `${n} / ${max} (earlier messages are sent too)`,
    placeholder: 'Ask about English or your draft (Ctrl+Enter to send)',
    label: 'Ask AI',
    full: (max: number) =>
      `You can ask up to ${max} questions. Press "Start over" to clear them and ask again.`,
    resetConfirm: 'Delete the whole "Ask AI" conversation and start over?',
    clearFailed: (message: string) => `Could not delete: ${message}`,
    loadFailed: (message: string) => `Could not load the earlier conversation: ${message}`,
    desc: 'Ask anything: differences between words, grammar and expressions, whether a sentence in your draft is right, how to write. Answers may include English (corrected or example sentences).',
    sends: 'draft, title, assignment, word and sentence counts, question',
  },

  translation: {
    button: 'Translate into Japanese',
    again: 'Translate again',
    busy: 'Translating…',
    slow: 'This takes a few seconds to 30 seconds.',
    noDraft: 'Write a draft to translate it.',
    desc: 'Translates your draft sentence by sentence into fairly literal Japanese, so you can check that your English says what you mean (mistakes are translated as written, not corrected).',
    stale: 'The text or title changed after translating. Translate again to see the current text.',
    none: 'Not translated yet.',
    missing: '(No translation. Please translate again.)',
    title: 'Title',
    failed: (message: string) => `Could not translate: ${message}`,
    loadFailed: (message: string) => `Could not load the translation: ${message}`,
    sends: 'draft, title',
  },

  feedback: {
    button: 'Score',
    again: 'Score again',
    busy: 'Scoring…',
    slow: 'This takes 30 seconds to a minute.',
    noDraft: 'Write a draft to score it.',
    desc: 'A score out of 100 with points for each area, a list of spelling mistakes, and hints with example corrections in English.',
    stale: 'The text or title changed after scoring. Score again after revising.',
    none: 'Not scored yet.',
    summary: 'Show the score',
    summaryTotal: (total: number) => `Show the score (${total} points)`,
    strengths: 'Strengths',
    spellings: (n: number) => `Spelling mistakes (${n})`,
    findings: (n: number) => `To fix (${n})`,
    noFindings: 'No major issues.',
    fix: 'Fix',
    failed: (message: string) => `Could not score: ${message}`,
    loadFailed: (message: string) => `Could not load the score: ${message}`,
    sends: 'draft, title, assignment, word and sentence counts',
    criteria: {
      structure: 'Organization',
      content: 'Content',
      grammar: 'Grammar',
      vocabulary: 'Vocabulary',
      requirements: 'Requirements',
    },
  },

  guide: {
    pageTitle: 'How to write an opinion paragraph',
    tabs: {
      structure: { label: 'Structure', short: 'Structure' },
      model: { label: 'Model paragraph', short: 'Model' },
      phrases: { label: 'Useful phrases', short: 'Phrases' },
    },
    flow: 'Order:',
    stats: (words: number, sentences: number) =>
      `${plural(words, 'word', 'words')} · ${plural(sentences, 'sentence', 'sentences')}`,
    modelOutline: 'Outline of this model paragraph (an example for STEP 2)',
    points: 'Writing tips',
    insertTip: 'Insert at the cursor in your draft',
    openDraft: 'Open the draft (STEP 3) to insert phrases by clicking.',
    insertHint: 'Click a phrase to insert it at the cursor in your draft.',
    viewOnlyHint: 'In STEP 3 (draft) you can click to insert phrases. Here they are for reference.',
    recommended: 'Recommended for this step',
    recommendedLabel: '(recommended)',
    close: 'Close',
    closeLabel: 'Close the guide',
    toPage: 'Open as a page',
    toPageTip: 'Go to the guide page',
  },

  review: {
    title: 'Review your mistakes',
    lead: 'Collects the latest score of each paragraph (only the latest score is kept, so scoring again replaces the earlier result).',
    empty:
      'No scored paragraphs yet. Score a draft with "Score" in the right pane of STEP 3 and it will appear here.',
    count: 'Scored paragraphs',
    average: 'Average total',
    weakest: 'Area to improve',
    weakestAverage: (percent: number) => ` avg. ${percent}%`,
    criteria: 'Average by area',
    barValue: (average: string, max: number, percent: number) =>
      `${average} / ${max} (${percent}%)`,
    timeline: 'Scores over time',
    timelineNote: 'Oldest first by scoring date. Click a topic to open its draft.',
    date: 'Scored on',
    theme: 'Topic',
    total: 'Total',
    column: (label: string, max: number) => `${label} (${max})`,
    mistakes: 'Common mistakes',
    mistakesNote:
      'Feedback by area (areas with the most feedback first; newest scores first within each area).',
    items: (n: number) => plural(n, 'item', 'items'),
    noFindings: 'No feedback.',
    scoredOn: (date: string) => ` · ${date}`,
  },

  notFound: {
    message: (hash: string) => `Page not found (${hash}).`,
    toList: 'Back to the list',
  },

  errors: {
    loadFailed: (message: string) => `Could not load: ${message}`,
    codes: {
      conflict: 'Updated on another device (or in another tab)',
      not_found: 'Not found (it may have been deleted)',
      bad_id: 'Invalid paragraph id',
      bad_json: 'The request could not be read',
      bad_stage: 'Invalid step',
      bad_text: 'Invalid text',
      bad_rev: 'Invalid revision number',
      bad_theme: 'Invalid topic',
      bad_kind: 'Invalid AI suggestion type',
      bad_question: 'The question is empty',
      empty_theme: 'The topic is empty',
      empty_draft: 'The draft is empty',
      empty_outline: 'The outline is empty',
      no_result: 'There are no AI suggestions yet',
      too_many_questions: 'You have reached the question limit',
      result_changed: 'The AI suggestions were regenerated, so the question was not kept',
      chat_changed: 'The conversation changed, so the question was not kept',
      too_large: 'The text is too large',
      method_not_allowed: 'This action is not allowed',
      forbidden: 'The request was rejected',
      ai_not_configured: 'ANTHROPIC_API_KEY is not set',
      ai_refusal: 'The AI declined to answer',
      ai_error: 'The AI request failed',
      internal: 'Internal server error',
    },
  },
}
