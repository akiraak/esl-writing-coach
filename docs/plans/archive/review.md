# 間違いの振り返り

## 目的・背景

学習用に見られるもの（構成の解説・モデル文・表現集・間違いの振り返り）の最後。2026-11-08、次の作業として Claude が選んだ。

決まっていること（`docs/plans/archive/app-features.md`）:
- 全パラグラフの**最新の指摘・点数を観点別に集め**、**よくする間違い**と**点数の推移**を見る
- 履歴は持たない（採点は最新の 1 回分だけ）ので、パラグラフごとの最新の採点を横断して集める
- ヘッダから移れる

## 対応方針

### Phase 1: 集める（サーバと純関数）

- 一覧（`list_folder`）で `feedback.json` の有無と `rev` も拾う（`ParagraphSummary.feedback`）
- `GET /api/review`: 採点のあるパラグラフごとに `feedback.json` を読み、テーマと合わせて返す。**id + rev で覚えておき**、変わっていなければ読み直さない（一覧のテーマと同じ。`src/paragraphs/feedbacks.ts`）
- 集計は純関数（`src/shared/review.ts`）: 採点したパラグラフの数・合計の平均・観点ごとの平均（満点に対する割合）・いちばん割合の低い観点・
  採点した日の順の推移・観点ごとの指摘の一覧（どのパラグラフのものか）

### Phase 2: 画面（`#/review`）

- ヘッダに「振り返り」（学習ガイドの左）。一覧画面からも移れる
- 上: 採点した数・合計の平均・観点ごとの平均の棒。いちばん低い観点を「伸ばしたいところ」として示す
- 点数の推移: 採点した日の順に、パラグラフ（テーマ・日付）ごとの合計と観点ごとの点の表。押すとそのパラグラフの下書きへ
- よくする間違い: 観点ごとの指摘（件数の多い順）。各指摘に引用・ヒント・どのパラグラフか
- 採点が 1 つも無ければ、下書きの右ペインの「採点」で採点すると集まることを知らせる

## 影響範囲

- 新規: `src/shared/review.ts`・`src/paragraphs/feedbacks.ts`・`src/browser/views/review.ts`・テスト
- `src/shared/types.ts`・`src/paragraphs/store.ts`（`summarizeEntries`）・`src/server/api.ts`・`src/server/server.ts`・`src/shared/route.ts`・`src/browser/main.ts`・`src/browser/ui.ts`（ヘッダ）・`src/browser/api.ts`・`web/style.css`・`CLAUDE.md`

## テスト方針

- `test/review.test.ts`: 集計（平均・割合・いちばん低い観点・推移の順・指摘の分け方・採点が無いとき）
- `test/paragraph-store.test.ts`: 一覧で `feedback.json` を拾う
- `test/feedbacks.test.ts`: rev で覚えて読み直さない・壊れた feedback.json は飛ばす
- `test/server.test.ts`・`test/route.test.ts`: `GET /api/review`・`#/review`
- 画面は 3017 番で、試し用のパラグラフ 3 つに試し用の feedback.json を置いて確かめ、最後に消す
