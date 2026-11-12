# 一覧のカードに採点結果を出す

## 目的・背景

トップページ（一覧画面）のパラグラフのカードには、テーマ・3 段階の進み具合・更新日しか出ていない。
採点したかどうか・何点だったかは、パラグラフを開いて STEP 3 の「採点」のタブを見るか、「振り返り」を開かないと分からない。
一覧の各カードに最新の採点結果を出して、どれが採点済みで何点かをひと目で分かるようにする（2026-11-12 ユーザーの要望）。

## 対応方針

### 出すもの（カード 1 枚につき）

- **合計点**: `82 / 100`（採点の最新の 1 回分。`feedbacks` の JSON を `parseFeedback` で読み、合計はアプリが足した `total`）
- 観点ごとの点数は出さない（合計だけ。2026-11-12 ユーザーの決定。内訳は STEP 3 の「採点」のタブと「振り返り」で見る）
- **採点した日**: `採点 11/12`（`scoredAt`。更新日と同じ `formatDate`）
- **採点の後に変わった印**: 採点した本文・タイトルと今の下書き・タイトルが違えば「採点後に変更あり」を小さく出す
  （採点のカードの「採点した後に本文かタイトルが変わっています」と同じ比べ方にそろえる）
- **採点していないパラグラフ**: 何も出さない（「未採点」の文字は出さず、カードの高さだけそろえる）。採点の JSON が壊れていて読めないときも同じ

置く場所は、進み具合のラベル（`.plabels`）と更新日の行（`.meta`）の間。カード全体が編集画面へのリンクのままで、採点結果を押しても同じく開く（別のリンクは付けない）。

### データの渡し方

`GET /api/paragraphs` の各項目に採点の要約を足す（一覧のために採点の全文は送らない）。

- `src/shared/types.ts`: `ParagraphListItem` に `score: ListScore | null` を足す
  ```ts
  interface ListScore {
    total: number
    scoredAt: string
    /** 採点した後に本文かタイトルが変わっている。 */
    stale: boolean
  }
  ```
- `src/paragraphs/store.ts` の `listParagraphs()`: `feedbacks` を読んで（`listRows` に JOIN するか、別の 1 文で全部読んで id で合わせる）、
  `parseFeedback` → 要約にする。`stale` は同じ関数の中で読んでいる下書き・タイトルの本文と比べて決める
  - 要約を作る純関数（`Feedback` と今の下書き・タイトル → `ListScore`）は `src/shared/feedback.ts` に置き、変わったかの比べ方は採点のカード（`src/browser/feedback-pane.ts`）と同じ関数を使う（今カードの中に書いてあれば shared に出して共用する）
- `src/server/api.ts`: 一覧はストアの結果をそのまま返しているので、表の説明のコメントだけ直す
- DB の表は変えない（`schema_version` も上げない）

### 画面

- `src/browser/views/list.ts` の `card()`: `p.score` があれば採点の行を足す
- `web/style.css`: 採点の行のスタイル（合計は少し大きく。色は既存の変数。変更ありの印は採点のカードの `.score-stale` に合わせる）
- 並び順は変えない（更新日の新しい順のまま）

## 影響範囲

- `src/shared/types.ts`・`src/shared/feedback.ts`・`src/paragraphs/store.ts`・`src/browser/views/list.ts`・`web/style.css`
- `src/browser/feedback-pane.ts`（変わったかの比べ方を共用にする場合だけ）
- `src/server/api.ts`（コメント）、`CLAUDE.md`（一覧画面の説明と API の説明）
- 振り返り（`GET /api/review`）は変えない

## テスト方針

- `test/`（`node --test`。DB は `:memory:`）
  - 採点の無いパラグラフは `score: null`
  - 採点があれば合計・採点した時刻が入る
  - 採点の後に下書きを保存し直すと `stale: true`、タイトルだけ変えても `stale: true`、変えなければ `false`
  - 壊れた JSON は `score: null`（一覧は落ちない）
  - 削除したパラグラフは一覧に出ない（今のまま）
- 要約を作る純関数のテスト
- 画面はブラウザ（Playwright）で、採点済み・未採点・変更ありのカードが並んだときに崩れないこと、カードを押すと編集画面が開くことを確かめる
- `npm run typecheck`・`npm run lint`・`npm test`

## 決めたこと

- 観点ごとの点数は出さず、合計だけにする（2026-11-12 ユーザーの決定）
- カードを押したときの行き先は変えない（採点済みのカードも課題 = STEP 1 を開く。採点結果の上を押しても同じ）

## 結果（2026-11-12）

実装した。変わったかの比べ方は `src/shared/feedback.ts` の `isFeedbackStale` にまとめ、採点のカードと一覧で共用。
仮の DB のサーバを Playwright で開き、採点済み・変更あり・未採点のカードが同じ高さで並ぶことを確かめた。
