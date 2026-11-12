# 採点の指摘に修正の英文を出す

## 目的・背景

採点の指摘は「どこを・何を確かめるか」のヒントだけで、直した文は出さない決まりだった（2026-11-08）。
ヒントだけでは正しい形が分からないことがあるので、**指摘ごとに修正の英文を出す**ように変える（2026-11-11 ユーザーの決定）。

例: `begining investment when you are yung have three abvantages` → ヒントに加えて、直した英文も出す。

## 対応方針

- 指摘（`Finding`）に `fix`（修正例の英文。無ければ空文字）を足す。ヒント（日本語）は今のまま残す
  - 引用があるとき: 引用した箇所を直した英文（綴りなど、その箇所のほかの誤りも直す）
  - 引用が無いとき（全体・構成の指摘）: 足す文・直す文の例を示せれば英文、示せなければ空
  - 下書き全体の書き直しは出さない
- プロンプト（`src/ai/scoring.ts`）: 「直した文は書かない」を外し、`fix` の書き方を足す。出力のスキーマに `fix`
- 引用は今までどおり本文から 1 文字も変えずに抜き出させ、本文に無い引用は消す（`dropUnquotable`。元の文と修正例を並べて見せるため。`fix` は残す）
- 保存の形（`feedbacks` の JSON）は版 1 のまま。`fix` の無い古い結果は空として読む（採点し直すと出る）
- 画面: 採点のカードと振り返りの指摘に「修正例」を出す（引用 → ヒント → 修正例）
- 変えないもの: AI案・アウトラインの指摘・AI案への質問の「直した文は出さない」

## 影響範囲

`src/shared/feedback.ts`・`src/ai/scoring.ts`・`src/browser/feedback-pane.ts`・`src/browser/views/review.ts`・`web/style.css`・テスト・`CLAUDE.md`

## テスト方針

- `test/scoring.test.ts`: プロンプトに修正例の指示・スキーマに `fix`・`parseScoringOutput` と `parseFeedback` が `fix` を読む（無ければ空）・`dropUnquotable` が `fix` を残す
- `npm test`・`npm run typecheck`・`npm run lint`。本物の API で 1 回採点して確かめる
