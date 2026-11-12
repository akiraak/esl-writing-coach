# 採点で綴りの誤りをまとめて出す

## 目的・背景

採点の指摘は 10 個までで、同じ種類の誤りは 1 つにまとめるので、誤字（綴りの誤り）は「begining, yung の綴りも確認しよう」のように
ヒントのついでに触れられるだけだった。誤字は**まとめて一覧にし、正しい綴りも出す**（2026-11-11 ユーザーの要望）。

## 対応方針

- 採点の結果（`Feedback`）に `spellings: { wrong, right }[]` を足す（本文の綴りそのまま → 正しい綴り）
- プロンプト（`src/ai/scoring.ts`）: 綴りの誤りは指摘（findings）に 1 つずつ挙げず、`spellings` に**全部**挙げさせる。同じ誤りは 1 回。
  文法の誤り（三単現など）や語の選び方は今までどおり指摘に。綴りは「文法」の観点で見る、と基準に明記する
- 検証: `wrong` が本文に無いもの・`right` が空・同じもの・重複は捨てる（`dropUnquotable` と同じ考え方）。多くても 30 個
- 保存の形は版 1 のまま。`spellings` の無い古い結果は空として読む（採点し直すと出る）
- 画面: 採点のカードの「直すところ」の上に「綴りの誤り（n）」として `wrong → right` を並べる。振り返りの画面には出さない（後で要れば）

## 影響範囲

`src/shared/feedback.ts`・`src/ai/scoring.ts`・`src/server/api.ts`・`src/browser/feedback-pane.ts`・`web/style.css`・テスト・`CLAUDE.md`

## テスト方針

- `test/scoring.test.ts`: プロンプトとスキーマ・`parseScoringOutput`・`dropUnknownSpellings`・`parseFeedback`（無ければ空）
- `test/server.test.ts`: 本文に無い綴りが消えて保存される
- 本物の API で 1 回採点して確かめる
