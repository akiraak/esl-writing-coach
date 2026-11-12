# STEP 3 の下書きの日本語訳を出す

## 目的・背景

英語で書いた下書きが、言いたいこと（日本語で考えたこと）のとおりに伝わっているかを確かめたい。
下書きの日本語訳を出す。UI は 4 案を出し、ユーザーが次のように決めた（2026-11-11）。

- **STEP 3 だけ、右ペインを「AI / 翻訳 / 採点」のタブに分け、訳は「翻訳」のタブに出す**
- 訳は**直訳に近いもの**にする（誤りを気を利かせて直した訳にしない）

## 対応方針

### 右ペイン（STEP 3 だけタブ）

- STEP 3: タブ「AI」=「AI に質問」と、下の「ほかの段階の AI」／「翻訳」= 日本語訳のカード／「採点」= 採点のカード（畳まない）
- STEP 1・2 は今までどおりタブなし。翻訳・AI に質問・採点は「ほかの段階の AI」に畳んで残す
- 選んだタブは編集画面を開いている間は覚える。カードは作り直さず並べ替えるだけ（今までと同じ）
- `src/shared/ai-tools.ts` に機能 `translate` と、段階ごとのタブ（`aiTabsFor`）。`src/browser/ai-pane.ts` がタブを描く

### 日本語訳

- 「日本語に訳す」を押したときだけ訳す。押したら手元の未保存を保存し終えてから、サーバが保存されている下書きを読む（採点と同じ）
- **文に分けるのはアプリ**（`src/shared/counting.ts` の `splitSentences`。文数の数え方と同じ切り方）。AI には段落全体と番号つきの文を渡し、文ごとの訳を返させる。
  画面は文ごとに「英文 → 訳」を番号つきで並べる（英文は本文そのまま）
- 訳は直訳に近く: 書いてあるとおりを訳す。誤りがあっても正しい英文に直してから訳さない。意味が取れない文はそう書く
- 送るのは下書きだけ（課題・アウトラインは送らない）。モデルは AI案と同じで effort `medium`
- 最新の 1 回分を DB に残す（訳した本文も入れ、後で本文が変わったら知らせる）。表 `translations(paragraph_id, json, updated_at)`（版 4）
- API: `GET /api/paragraphs/:id/translation` → `{ translation, aiConfigured }`、`POST` で訳して保存 → `{ translation }`（下書きが空 400 `empty_draft`）

## 影響範囲

- 足す: `src/shared/translation.ts`・`src/ai/translation.ts`・`src/browser/translation-pane.ts`
- 変える: `src/shared/counting.ts`・`src/shared/ai-tools.ts`・`src/browser/ai-pane.ts`・`src/browser/api.ts`・`src/browser/views/edit.ts`・`src/ai/client.ts`・
  `src/server/api.ts`・`src/paragraphs/database.ts`・`src/paragraphs/store.ts`・`web/style.css`・テスト・`CLAUDE.md`

## Step

1. 保存と API（文の分割・プロンプト・表・API）
2. 右ペインのタブと翻訳のカード
3. 本物の API で確かめる・`CLAUDE.md`・後片付け

## テスト方針

- `splitSentences` が `countSentences` と同じ数になる
- プロンプト（直訳の指示）・出力の検証（番号で対応、足りない訳）
- 表の版 3 → 4 の移行、`translations` の読み書き
- API: 無ければ null・訳して保存・空は 400・キーなしは 503
- `aiToolsFor`・`aiTabsFor`
- 本物の API で 1 回訳す
