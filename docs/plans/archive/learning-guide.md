# 学習ガイド: 構成の解説・モデル文・表現集

## 目的・背景

書いている途中でも横に開ける学習ガイドを作る（`CLAUDE.md` の「最初に作るもの」「画面構成」）。
学習ガイド画面（`#/guide`）と、編集画面の右ペインで同じ中身を出す。中身は固定コンテンツなのでリポジトリに置く（Dropbox には置かない）。

## 決定（2026-11-08）

- **モデル文の題材はモックと同じ**「High school students should have part-time jobs」。英文は Claude が書く（ユーザーが読んで直す）
- モデル文は 1 本。構成の 4 役割で色分けし、どの文がどの役割かを見せる

## 対応方針

### Phase 1: 中身のデータ（`src/shared/guide.ts`。純データ）

- 構成の解説: 4 役割（Topic sentence / Reasons / Examples・Details / Concluding sentence）の名前・日本語の名前・説明と、並び（Topic → Reason・Example ×3 → Conclusion）。モックの文言をもとにする
- モデル文: 8 文を役割つきで（Topic 1・Reason と Example を 3 組・Conclusion 1）。
  あわせて**そのモデル文のアウトライン**（日本語の字下げのテキスト。STEP 3 で作るものの見本）と、書き方のポイント（日本語）
- 表現集: 意見・理由・例・結論・つなぎ（transition words）の 5 組。各表現に短い日本語の意味を添える
- テスト（`test/guide.test.ts`）で中身の食い違いを防ぐ: モデル文の役割の並びが型どおり・アウトラインの役割（`outlineRoles`）と文の役割が同じ並び・
  各文が 1 文と数えられる・語数が 80〜150 語・表現が重複していない

### Phase 2: 画面

- 描き方は `src/browser/guide-content.ts` にまとめ、学習ガイド画面と右ペインの両方から使う（右ペインは幅が狭いので 1 列の詰めた形）
  - 構成: 4 役割のカード（上の線が役割の色）と並びの図
  - モデル文: 役割の色で塗った英文と凡例・語数と文数・アウトラインの見本（下書きの横と同じ役割の色のリスト）・ポイント
  - 表現集: 組ごとのカード（左の線が役割の色）に表現と日本語の意味
- 役割の色のリストは下書きの画面と共用にする（`src/browser/role-list.ts` に分ける）
- 学習ガイド画面: タブ（構成の解説 / モデル文 / 表現集）。ヘッダの右は「パラグラフ一覧へ」（モックと同じ）
- 選んだタブは学習ガイド画面と右ペインで共有する（このタブを開いている間）

## 影響範囲

- 新規: `src/shared/guide.ts`・`src/browser/guide-content.ts`・`src/browser/role-list.ts`・`test/guide.test.ts`
- `src/browser/guide-pane.ts`・`src/browser/views/guide.ts`・`src/browser/views/draft.ts`・`src/browser/ui.ts`（ヘッダ）・`web/style.css`

## テスト方針

- `test/guide.test.ts`（上記）
- 3017 番でヘッドレスブラウザ: 学習ガイド画面の 3 つのタブ・右ペインの 3 つのタブ・タブの共有・下書きの横のリストが前と同じ
