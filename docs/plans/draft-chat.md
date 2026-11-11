# STEP 3 で AI に自由に質問する

## 目的・背景

2026-11-11、ユーザーから「STEP 3 で AI に自由に質問できる機能が欲しい」と要望があった。

今の AI は、どれも決まった形の機能（テーマの候補・理由と例の候補・アウトラインの指摘・採点）と、AI案の結果についての質問だけである。
下書きを書いている途中に、次のようなことを気軽に聞ける場所が無い。

- 「because と since はどう違う？」「この段落で for example を 2 回使うのはおかしい？」（語・文法・表現）
- 「2 文目の時制は合っている？」「理由の順番はこれで伝わる？」（自分の下書きについて）
- 「concluding sentence で新しい理由を出してはいけないのはなぜ？」（書き方）

右ペインの AI に「AI に質問」のカードを足し、STEP 3 で上に出す。

## 既存の作りで使えるもの

- **AI案への質問**（`docs/plans/archive/ai-followup-questions.md`）: プロンプトと出力の検証の純関数（`src/ai/questions.ts`）、
  サーバが DB から文脈を読んで組む API（`POST /api/paragraphs/:id/ai/:kind/questions`）、`ai_questions` の表、
  画面の質問の欄（`src/browser/ai-questions.ts`。最新の 1 往復＋「前の質問（n）」・Ctrl+Enter・呼び出し中に画面を離れても続きから）
- **採点**（`docs/plans/archive/ai-scoring.md`）: 押したら手元の未保存を保存し終えてから、サーバが保存されている下書きと課題を読む（`prepare`）
- **右ペインの AI**（`docs/plans/archive/right-pane-layout.md`）: カードの外枠 `cardFrame`、段階ごとの並び `aiToolsFor`

## 対応方針（2026-11-11 に「決めること」を確定）

### 何を送るか

- 送るのは、**保存されている下書き・課題（テーマ・条件・語数と文数の指定）・アプリが数えた語数と文数・それまでの質問と答え・今回の質問**。
  サーバが DB から読んで組む（採点と同じ。押したら手元の未保存を保存し終えてから送る）
- 下書きが空でも質問できる（「まだ書いていません」として送る。書く前の相談にも使える）
- アウトライン・AI案の結果は送らない（採点と同じく、下書きと課題に絞る）

### 答え方（プロンプト。`src/ai/draft-chat.ts`）

- **日本語で**説明し、短く（本文 2〜4 文・箇条書きは 3 つまで・最初の 1 文で答える。AI案への質問と同じ形）
- **英語は制限しない**（2026-11-11 ユーザーの決定）: 直した文・書き換えた文・例文も、質問に答えるのに要れば出してよい。
  アプリのほかの AI（採点・AI案・AI案への質問）の「直した文は出さない」は変えない。**この「AI に質問」だけの例外**
  - ただし頼まれていないのに下書き全体を書き直したり、パラグラフを丸ごと書いたりはしない（聞かれたことに答える）
- 下書きの文を指すときは短く引用する
- opinion paragraph を書くことや英語と関係の無い質問には、短く答えるか、ここでは扱わないと伝える

### 残し方

- パラグラフごとに DB に残し（新しい表 `draft_questions`。版 3）、開き直しても続きから見られる・続けて聞ける（前のやりとりも送る）
- 回数の上限（例 30 回）。「はじめから」で消して聞き直せる
- 呼び出し中に画面を離れて戻っても続きから出す（AI案への質問と同じ仕組み）

### 画面

- 右ペインの AI に「AI に質問」のカード（説明・送るもの・質問の欄・やりとり）。STEP 3 で採点より上に出す。
  ほかの段階では「ほかの段階の AI」に畳んで残す（開けばそこでも聞ける）
- 質問の欄は AI案への質問の部品（`ai-questions.ts`）を、送り先を差し替えられるようにして使い回す

### モデル

- AI案と同じ（`claude-opus-5-5`・effort `medium`）。`ANTHROPIC_API_KEY` が無ければ使えない（503 `ai_not_configured`）

## 決めること

2026-11-11、ユーザーが決めた:

- [x] 答えに英語をどこまで出すか: **制限しない**（直した文も出す。推奨は「語句＋テーマと関係ない例文 1 つ」だったが、ユーザーが選んだ）。
  「AI に質問」だけの例外で、ほかの AI の「直した文は出さない」は変えない
- [x] 下書きを送るか: **送る**（保存されている下書きをサーバが読む）
- [x] STEP 3 での採点との並び: **「AI に質問」を上、採点を下**（採点の結果は 2 つ目のときは畳む）

## 進め方（Phase）

### Phase 1: プロンプトと出力の検証（`src/ai/draft-chat.ts`）

- システムプロンプト（英語は制限しない・頼まれていない全体の書き直しはしない、を含む）、ユーザーメッセージの組み立て（下書き・課題・語数と文数・それまでのやりとり・質問）、出力のスキーマ（`answer`）と検証
- `test/draft-chat.test.ts`: メッセージに下書き・課題・やりとりが入る／空の下書き／検証（空・長すぎ・形が違う）

### Phase 2: 保存と API

- `src/paragraphs/database.ts`: 版 3 で `draft_questions(paragraph_id, seq, question, answer, created_at)` を足す（`migrate()`）
- `src/paragraphs/store.ts`: 読む・足す・消す
- `src/server/api.ts`: `GET` は `GET /api/paragraphs/:id/ai` の応答に `draftQuestions` を足す。
  `POST /api/paragraphs/:id/draft/questions` `{ question }`（空・長すぎる 400 `bad_question`・上限 400 `too_many_questions`）、`DELETE /api/paragraphs/:id/draft/questions`（はじめから）
- `test/server.test.ts`・`test/paragraph-store.test.ts`: 偽の AI で、保存・続けて聞く・上限・消す・版 2 の DB からの移行

### Phase 3: 画面

- `src/shared/ai-tools.ts`: 機能 `chat` を足し、STEP 3 の並びを決めたとおりに（テスト更新）
- `src/browser/ai-questions.ts`: 送り先（`ask`）と保存先の鍵を差し替えられるようにする（AI案への質問は今のまま動く）
- `src/browser/draft-chat-pane.ts`（新規）: 「AI に質問」のカード。送る前に下書きを保存し終える（採点の `prepare` と同じ）。「はじめから」
- `src/browser/views/edit.ts`・`src/browser/api.ts`・`web/style.css`

### Phase 4: 本物の API で確かめる

- 数回だけ本物の API を呼び、答え方（日本語の説明・短さ・聞かれたことに答える・頼まれていない全体の書き直しをしない）を確かめ、必要ならプロンプトを直す

### Phase 5: 後片付け

- `CLAUDE.md` の「後で足すもの」に「AI に質問」を足し（**直した文を出してよい例外**であることを明記）、表・API・画面構成（右ペインの並び）を直す
- このプランを `docs/plans/archive/` へ、`TODO.md` の項目を `DONE.md` へ

## 影響範囲

- 新規: `src/ai/draft-chat.ts`・`src/browser/draft-chat-pane.ts`・テスト
- 変更: `src/ai/client.ts`（呼び出しを足す）・`src/paragraphs/database.ts`（版 3）・`src/paragraphs/store.ts`・`src/server/api.ts`・
  `src/shared/ai-tools.ts`・`src/shared/ideas.ts`（保存した AI案の応答の型に足す）・`src/browser/ai-questions.ts`・`src/browser/api.ts`・`src/browser/views/edit.ts`・`web/style.css`
- DB の版が 2 → 3 に上がる（起動時に表を足すだけ。今のデータには触れない）。バックアップは今どおり

## テスト方針

- `node --test`: プロンプトと検証（Phase 1）、保存と API（Phase 2。偽の AI・`:memory:` の DB）、段階ごとの並び（Phase 3）。実 API は叩かない
- 画面: 作業用の DB・3017 番のサーバ（`.env` を読まないので Dropbox のバックアップも AI も動かない）で、カードの並び・質問の欄・はじめから・キーが無いときの知らせ
- Phase 4 だけ本物の API を数回（ユーザーのキー。呼ぶ回数を絞る）

## 結果（2026-11-11）

Phase 1〜4 を実装した。

- **Phase 1**: `src/ai/draft-chat.ts`（システムプロンプト・メッセージの組み立て・スキーマ・検証）と `test/draft-chat.test.ts`。
  答えは 800 字を目安に短くさせ、4000 字を超えたら受け取らない（`AiOutputError`）
- **Phase 2**: DB の版 3 で `draft_questions`。保存層に `readDraftQuestions`・`addDraftQuestion`・`clearDraftQuestions`。
  API は `POST` / `DELETE /api/paragraphs/:id/draft/questions`、`GET /api/paragraphs/:id/ai` の応答に `draftQuestions`。
  上限は 30 回（`MAX_DRAFT_QUESTIONS`）。答えを待つ間にやりとりが変わったら（はじめからにした・別のタブで聞いた）409 `chat_changed` で残さない
- **Phase 3**: 機能 `chat` を足し、STEP 3 は「AI に質問」→ 採点の順。質問の欄は `createQuestionBoxWith` で送り先・上限・文言を差し替え（AI案への質問は今のまま）。
  `src/browser/draft-chat-pane.ts`（送る前に保存し終える・「はじめから」は確認つき）。採点のカードは結果を「採点の結果を見る（n 点）」に畳めるようにした（STEP 3 では 2 つ目なので畳む。押して採点したら開く）。
  3017 番の作業用サーバで、並び・前の質問の畳み・キーが無いときの知らせ（質問は欄に戻る）・ほかの段階で開く・はじめから、を確かめた
- **Phase 4**: 本物の API を 5 回（1 回 2〜5 秒）。語の違い（例文つき）・「2 文目の動詞は合っている？」（聞かれた文だけ直した形を出す）・concluding sentence の例・
  「今のところどう？」（全体は書き直さず 3 点に絞る）・関係ない質問（ここでは扱わないと伝える）。どれも日本語の説明で 120〜380 字。プロンプトは直していない

## Phase 5 の残り（CLAUDE.md に書く内容の案）

CLAUDE.md は別のセッションからの依頼では書き換えないので、ここに案を置く。入れたらこのプランを `docs/plans/archive/` へ、`TODO.md` の項目を `DONE.md` へ。

「後で足すもの」に足す:

```markdown
- **AI に質問**（2026-11-11。`docs/plans/archive/draft-chat.md`）: 右ペイン（AI）の「AI に質問」のカード（STEP 3 でいちばん上。`src/browser/draft-chat-pane.ts`）。下書きを書いている途中に、語・文法・表現・自分の下書き・書き方について日本語で自由に聞ける
  - 答えは日本語で短く（本文 2〜4 文・箇条書き 3 つまで）。**英語は制限しない: 直した文・書き換えた文・例文も出る**（2026-11-11 ユーザーの決定）。
    ほかの AI（採点・AI案・AI案への質問）の「直した文は出さない」は変えず、**この「AI に質問」だけの例外**。頼まれていないのに下書き全体を書き直したりはしない（プロンプトは `src/ai/draft-chat.ts`）
  - 送るのは、保存されている下書き・課題・アプリが数えた語数と文数・それまでの質問と答え・今回の質問（**サーバが DB から読んで組む**。押したら手元の未保存を保存し終えてから。アウトライン・AI案は送らない）。下書きが空でも聞ける。モデルは AI案と同じで effort `medium`
  - 続けて聞ける（前のやりとりも送る）。**30 回まで**。DB の `draft_questions` に残し、「はじめから」で消して聞き直せる。答えを待つ間にやりとりが変わったら残さず 409 `chat_changed`
```

ほかに直すところ:

- 「画面構成」の右ペイン: STEP 3 = **AI に質問・採点**（採点の結果は 2 つ目なので畳む）
- 「データ保存」の表: `draft_questions(paragraph_id, seq, question, answer, created_at)`: STEP 3 の「AI に質問」のやりとり（版 3 で足した）
- 「技術スタック」の API: `POST` / `DELETE /api/paragraphs/:id/draft/questions`（`bad_question`・`too_many_questions` は 400、`chat_changed` は 409）、`GET /api/paragraphs/:id/ai` に `draftQuestions`
- 「コードの置き場所」: `src/ai/` に `draft-chat.ts`、`src/browser/` に `draft-chat-pane.ts`
