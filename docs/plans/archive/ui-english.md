# UI の英語化（英語 / 日本語の切り替え）

## 目的・背景

画面の文字（ボタン・見出し・ヒント・知らせ・エラー）は今すべて日本語で書いてある。
英語で書く練習のツールなので、画面も英語で使えるようにし、**英語と日本語の UI をいつでも切り替えられる**ようにする（2026-11-17 ユーザーの要望）。

今の状態（2026-11-17 に調べた）:

- 画面の文字は各ファイルに直書き。仕組み（辞書・`t()`）は無い
- ブラウザ側: `src/browser/` のほぼ全ファイル（多いのは `map.ts`・`ideas-pane.ts`・`views/edit.ts`・`views/draft.ts`・`feedback-pane.ts`・`export-dialog.ts`・`ai-pane.ts`・`ai-questions.ts`・`views/list.ts`）。`confirm()`・`alert()`・`aria-label`・`placeholder` にもある
- 共有の純関数が日本語の文を返している: `stage-summary.ts`（`未着手`・`120–150 語`）・`meter.ts`（`指定なし`・`範囲内`）・`outline-checks.ts`・`outline-prompts.ts`・`ai-tools.ts`（カード名・タブ名）・`feedback.ts`（観点名）・`review.ts`・`guide.ts`（学習ガイドの中身）
- サーバのエラーの `message` は日本語（`src/server/api.ts`）で、ブラウザはそれをそのまま出している
- `web/index.html` の `読み込み中…` と `<html lang="ja">`

## 対応方針

### 仕組み

- **辞書**: `src/shared/i18n/`（Node にも DOM にも依存しない）
  - `ja.ts` を元にし、`en.ts` は `typeof ja` と同じ形を満たす（キーの抜けは型チェックで落ちる）
  - 値は文字列か、引数を取る関数（`(n: number) => string`。英語の単数・複数 `1 reason` / `2 reasons`、語順の違いを関数の中で吸収する）
  - キーは画面・部品ごとに入れ子にする（`list.newParagraph`・`draft.meter.inRange` など）
- **言語の型**: `type Lang = 'en' | 'ja'`
- **共有の純関数**: 日本語の文を返していたものは、`Lang` を引数に取る（または辞書を受け取る）形に変える。
  サーバでも使う関数（`assignment.ts` など）の**データの書式は変えない**（下の「変えないもの」）
- **ブラウザ**: `src/browser/i18n.ts` に今の言語と `t` を持つ。部品は描くときに `t` を引く
- **言語の保存**: ブラウザの `localStorage`（名前・クラスや右ペインの幅と同じく、読めなくても既定で動く）。サーバ・DB には持たない
- **切り替え**: ヘッダの右に `EN | 日本語` の切り替え（押した方に変わる）
  - 切り替えたら、**未保存を保存し終えてから今の画面を作り直す**（ページは読み直さない。AI の呼び出し中の Promise はメモリに残っているので、作り直した画面に出る。
    編集画面は `View.navigate()` の「作り直さずに済むか」を使わず、強制的に作り直す。作り直した画面は、画面を移るときと同じく保存の終わりを待ってサーバから読む。
    競合・保存の失敗で残った変更があれば、消えることを確かめてから切り替える）
  - `<html lang>` も切り替える。英文（本文・モデル文・修正例など）は今どおり `lang="en"`、英語 UI の中の日本語（ユーザーのテーマ・条件、AI の日本語の答え）は `lang="ja"` を付ける
- **サーバのエラー**: ブラウザが `error` のコード（`conflict`・`empty_draft`・`ai_not_configured` など）から辞書の文を出す。知らないコードはサーバの `message` をそのまま出す。サーバの `message` は日本語のまま（ログ・curl 用）

### 訳すもの

- 画面の文字すべて: ヘッダ・一覧・編集画面（タイル・STEP 1〜3・マップの操作の説明・メーター・書き出しのダイアログ）・右ペインの AI のカード・質問の欄・学習ガイドの引き出しの枠・振り返り・保存の状態・競合の知らせ・`confirm()`/`alert()`・`aria-label`・`placeholder`・`title`
- 段階のタイルの「日本語可 / 英語のみ」→ `Japanese OK` / `English only`
- 型のチェック・選んでいる項目に合わせた問い（`outline-checks.ts`・`outline-prompts.ts`）
- 学習ガイドの解説文・書き方のポイント（日本語の意味とモデル文のアウトラインは残す。「決めたこと」の 2）

### 変えないもの

- **ユーザーが書いたもの**（テーマ・条件・アウトライン・下書き）は訳さない
- **課題の書式**（`- 語数:`・`- 文数:`・`## 条件`）は DB の中の書式なので変えない（画面はフォームなので見えない）
- 結論の見分け方（「結論」「まとめ」「Conclusion」で始まる）は言語によらず今のまま
- 日本語が混じったときの注意は、どちらの UI でも出す（中身は辞書の文）
- 書き出し・提出用のファイルの中身（ユーザーの本文と、名前・クラス・日付）
- AI の答え（日本語のまま。「決めたこと」の 3）と、保存してある AI の結果
- `CLAUDE.md`・プラン・コメントは日本語のまま

### 決めたこと（2026-11-17 ユーザーの決定）

1. **既定の言語は英語**: 初めて開いたとき（`localStorage` に無い・読めないとき）は英語 UI
2. **学習ガイド**: 英語 UI では解説文・ポイントを英語にする。**表現集の「日本語の意味」とモデル文のアウトライン（日本語）は学習の中身として残す**（英語 UI でも日本語の意味が見える）
3. **AI の答えは英語にしない**: AI案・AI案への質問・AI に質問・採点のヒントは、UI が英語でも今どおり日本語で答える。プロンプトは言語によらず変えない
   （日本語訳のカードも英語 UI で日本語訳のまま）。カードの見出し・ボタン・「送るもの」の説明など画面の文字だけを訳す
4. AI に送るプロンプトの中身（観点名など）も言語によらず今のまま

## Phase

- **Phase 1: 仕組みと外枠**
  - `src/shared/i18n/`（`ja.ts`・`en.ts`・型）、`src/browser/i18n.ts`（今の言語・`t`・保存）
  - ヘッダの切り替えと作り直し、`<html lang>`、`index.html` の読み込み中
  - 一覧・ヘッダ・保存の状態・ルートの名前・エラーのコード → 文
- **Phase 2: 編集画面（STEP 1〜3）**
  - タイル・`stage-summary.ts`・課題のフォーム・アウトライン（`map.ts` の説明・`outline-checks.ts`・`outline-prompts.ts`）・下書き（`meter.ts`・タイトル・リスト・つまみ）・書き出しのダイアログ・競合の知らせ
- **Phase 3: 右ペイン（AI）**
  - `ai-tools.ts`・`ai-pane.ts`・`ideas-pane.ts`・`ai-questions.ts`・`draft-chat-pane.ts`・`translation-pane.ts`・`feedback-pane.ts`（観点名は `feedback.ts`）
- **Phase 4: 学習ガイドと振り返り**
  - `guide.ts` の英語版の解説（日本語の意味・モデル文のアウトラインは残す）・`guide-content.ts`・`guide-pane.ts`・`views/guide.ts`・`views/review.ts`・`review.ts`
- **Phase 5: 仕上げ**
  - 英語は日本語より長いので、ボタン・タイル・左ペイン・右ペインの最小幅（300px）で崩れないかを直す（`web/style.css`）
  - `CLAUDE.md` に言語の切り替えと辞書の置き場所を書く（文中の画面の文言は日本語 UI のものとして残す）

## 影響範囲

- 新規: `src/shared/i18n/`・`src/browser/i18n.ts`
- 変更: `src/browser/` のほぼ全部、`src/shared/` の `stage-summary.ts`・`meter.ts`・`outline-checks.ts`・`outline-prompts.ts`・`ai-tools.ts`・`feedback.ts`・`review.ts`・`guide.ts`、`web/index.html`・`web/style.css`
- サーバ（`src/server/`・`src/ai/`・`src/paragraphs/`）・DB・API の形は変えない
- 既存のテストのうち日本語の文を見ているもの（`stage-summary`・`meter`・`outline-checks`・`outline-prompts`・`guide` など）は、`'ja'` を渡す形に直す

## テスト方針

- `test/i18n.test.ts`
  - `en` と `ja` のキーが同じ（型でも防ぐが、実行時にも入れ子を辿って確かめる）。値が空でない
  - 引数を取る文の単数・複数（`1 reason` / `2 reasons`）
  - **直書きの日本語が残っていないか**: `src/browser/` と UI の文を返す `src/shared/` のファイルの文字列リテラル（コメントを除く）に日本語が無いこと（辞書・`guide.ts` の日本語の意味など決めた例外を除く）
- 共有の純関数のテストを両方の言語で（`summarizeStage`・メーター・型のチェック・問い）
- ブラウザ（Playwright）で、一覧・STEP 1〜3・右ペインの各タブ・学習ガイド・振り返り・書き出しのダイアログを両方の言語で開いて、日本語（英語 UI）の取り残しと崩れが無いことを見る。
  切り替えても打ちかけの本文が消えない・自動保存が続く・AI の呼び出し中に切り替えても結果が出ることを確かめる
- `npm run typecheck`・`npm run lint`・`npm test`

## 結果

### Phase 1（2026-11-17）

- 辞書は `src/shared/i18n/`（`ja.ts` が元で `Messages` の型を決め、`en.ts` はそれを満たす。`index.ts` に `Lang`・`DEFAULT_LANG = 'en'`・`parseLang`・`apiErrorText`）。
  ブラウザは `src/browser/i18n.ts`（`t()`・`getLang`・`setLang`。`localStorage` の `esl-writing.lang`）
- ヘッダの右端に `EN | 日本語`（`ui.ts` の `langSwitch`）。押すと `main.ts` が `flush()` → 残った変更があれば確認 → `setLang` → `render(true)`
- 訳したもの: ヘッダ（振り返り・学習ガイド・パラグラフ一覧へ・書き出し）・一覧画面（作成のダイアログ・削除の確認も）・ページが無いとき・保存の状態とタイルの保存の印・段階の名前（`stageLabel`。
  タイル・見出し・次のステップへのボタン・右ペインの「STEP n ○○で使う AI」の段階名にも効く）・読み込めないとき・サーバのエラー（`errorText` がコードから辞書の文に）
- `index.html` は `lang="en"`・`Loading…`（スクリプトが覚えた言語に直す）
- `test/i18n.test.ts`: 辞書のキーと値の種類がそろう・英語の辞書に日本語が無い・サーバのエラーのコードが全部辞書にある・
  訳し終えたファイルに直書きの日本語が残っていない（`TRANSLATED` に Phase ごとにファイルを足す）
- 仮の DB のサーバを Playwright で開き、既定が英語・一覧と作成のダイアログ・編集画面のヘッダ・未保存のまま切り替えても打ちかけのテーマが残って保存される・
  読み直しても言語が残る・ページが無いとき・404 のエラーの文を確かめた

### Phase 2（2026-11-17）

- 訳したもの: 段階のタイル（言語の印・状態の行）・課題のフォーム・課題の帯・アウトライン（早見・型のチェック・選んでいる項目に合わせた問い・マップの操作のボタンと早見）・
  下書き（メーター・日本語の注意・タイトルと本文の欄のラベル・アウトラインのリスト・つまみ）・書き出しのダイアログ・競合の知らせ・右ペインの幅の境・次のステップへのボタン・
  採点／翻訳／質問の前に保存できなかったときの文（`prepareDraft` は `'score' | 'translate' | 'ask'` を受け取る）
- 共有の純関数は `lang` を受け取る: `summarizeStage(stage, text, lang)`・`meterOf(count, range, kind, lang)`（単位は `'words' | 'sentences'`）・`checkOutline(text, lang)`・`outlinePrompt(text, line, lang)`。
  画面の指定の幅は `describeCountRange(range, kind, lang)`（`120+ words`・`up to 10 sentences`）。**`describeRange` は AI のプロンプト用に日本語のまま残した**
- 英語の単数・複数は辞書の関数の中（`1 word` / `2 words`・`1 reason so far.`）
- CSS の `content` に入れていた「次に → 」を辞書に移した（`.outline-prompt-next-label`）。英語の UI では課題のフォームの行の名前の幅を広げた（`html[lang='en'] .range-label`）
- `test/i18n.test.ts` の `TRANSLATED` に Phase 2 のファイルを足し、残してよい文字列は「含む」で見るようにした。既存のテストは `'ja'` を渡し、英語の文のテストを足した
- 仮の DB のサーバを Playwright で開き、STEP 1〜3・書き出しのダイアログ・競合の知らせを英語で見て、残っている日本語がユーザーの書いた条件だけであること、
  競合のまま切り替えると確認が出て、受けると保存されている内容で描き直すこと、日本語の UI が前と変わらないことを確かめた

### Phase 3（2026-11-17）

- 訳したもの: 右ペインの枠（見出し・「STEP n ○○で使う AI」・STEP 3 のタブ・「ほかの段階の AI」の行・下の注意・送るもの・出した日時）・
  テーマの候補・理由と例の候補・アウトラインの指摘・AI案への質問の欄・AI に質問・日本語訳・採点（観点の名前・修正例のラベルも）
- 共有の部分: `ai-tools.ts` の `AI_TOOL_INFO` をやめ、使う段階の番号 `AI_TOOL_STEPS` だけにした（名前と `STEP 1・2` / `STEP 1, 2` の書き方は辞書の `ai.tools`・`ai.steps`）。
  `AiTab` から `label` を外し（名前は辞書の `ai.tabs[key]`）、`key` を `'ai' | 'translate' | 'score'` にした
- **AI に渡すプロンプトで使う名前は日本語のまま残した**: `CRITERIA` の `label`（採点の観点）と `STANCE_LABEL`（賛成・反対）。画面は辞書の `feedback.criteria`・`ideas.stance`
- AI の日本語の答え（テーマの日本語訳・理由と例・アウトラインの指摘・質問の答え・日本語訳・採点の一言・よかった点・ヒント）に `lang="ja"` を付けた
- `test/i18n.test.ts`: Phase 3 のファイルを `TRANSLATED` に足し、観点の名前と `CRITERIA`、AI の機能・タブの名前とそれぞれの一覧がそろうことを見る
- 仮の DB に AI案・質問・日本語訳・採点の結果を直に入れたサーバを Playwright で開き、英語の右ペインで `lang="ja"` の外に残る日本語がユーザーの書いた質問だけであること、
  日本語の UI が前と同じであることを確かめた（API キーが無いので、AI の呼び出し中に切り替える動きは試していない）
- 気づいたこと: 言語を切り替えると編集画面を作り直すので、STEP 3 で選んでいたタブは最初の「AI」に戻る。採点・日本語訳の呼び出し中に切り替えると、
  作り直した画面は終わるのを待たずに前の結果を出す（AI案・質問の欄はメモリの Promise を待つので続きから出る）。画面を移って戻ったときと同じ動き

### Phase 4（2026-11-17）

- 学習ガイド: `src/shared/guide.ts` に `Localized`（`{ en, ja }`）を足し、構成の解説（`STRUCTURE[].description`）・書き方のポイント（`MODEL.points`）・表現集の見出し（`PHRASES[].title`）を両方の言語で持つ。
  役割の日本語の名前（`STRUCTURE[].ja`）・表現の日本語の意味・モデル文のアウトラインは学習の中身としてどちらの UI でも出し、`lang="ja"` を付けた
- 枠の文字（タブの名前・並び・語数と文数・見出し・表現を入れるときのヒント・おすすめの印・引き出しの見出しとボタン・学習ガイド画面の見出し）は辞書の `guide`。`GUIDE_TABS` はタブの key の並びだけにした
- 振り返り: 辞書の `review`。観点の名前は `feedback.criteria` を使う（`ReviewSummary` の `label` は AI のプロンプトと同じ日本語の名前なので画面では使わない）。採点のヒントに `lang="ja"`
- `test/guide.test.ts`: 英語の文に日本語が混じらず、空でないこと。`test/i18n.test.ts` の `TRANSLATED` に Phase 4 のファイルを足した。
  これで `src/browser/` の直書きの日本語は言語の切り替えのボタンの「日本語」だけ（`src/shared/` に残るのは課題の書式・AI のプロンプト用の名前・学習ガイドの中身）
- 仮の DB のサーバを Playwright で開き、学習ガイド画面の 3 つのタブ・編集画面の学習ガイドの引き出し・振り返りを英語で見て、`lang="ja"` の外に日本語が残っていないこと、日本語の UI が前と同じであることを確かめた
- Phase 5 で直すもの: 振り返りの「伸ばしたいところ」のカードで、英語の観点の名前（Requirements）が大きな字のため `avg. 50%` が次の行に折り返す

### Phase 5（2026-11-17）

- 英語と日本語の UI で、一覧・STEP 1〜3（STEP 3 は 3 つのタブ）・学習ガイドの引き出しと画面・振り返り・書き出しのダイアログを、
  アプリの最小幅（`body` の `min-width: 1200px`）と 1280px・右ペインの幅を最小の 300px にして Playwright で開き、
  横にはみ出す要素・1 行のはずの部品の折り返し・ページの横スクロールを機械で探して、両方の言語を比べた（日本語でも同じものは前からの動きとして外した）
- 直したもの（英語の UI だけで起きていた）:
  - 右ペインのカードの見出しが長いと（`Reasons & examples`）、右ペイン 300px で出した日時がカードの外にはみ出す → `.ai-card-head` を折り返せるようにし、日時は次の行の右に回す
  - 振り返りの「伸ばしたいところ」で `avg. 50%` が折り返す → 英語の UI では観点の名前を少し小さく（24px）し、平均は `nowrap` でまとめる
  - AI案への質問の欄のプレースホルダが 2 行に収まらない → 英語の文を短くした（`Ask in Japanese (Ctrl+Enter to send)`）
- そのままにしたもの: マップの操作の早見（英語は 2 行になる。補足の小さい文字のため）、表現集のボタンの折り返し・ほかの段階の行の日時の省略・日本語の質問の欄のプレースホルダ（どれも日本語でも同じ前からの動き）
- `CLAUDE.md` の「表示の言語」を仕上げ、このプランを `docs/plans/archive/` に移した
