# 添削ボタンの設置（添削の自動実行をやめる）

## 目的・背景

現状は自動保存の完了をトリガーに添削 API（Claude 呼び出し）が自動で走る。書きかけの途中でも添削が走って API コストがかかり、また意図しないタイミングで出力が書き換わる。そこで:

- **保存は従来どおり自動**（2 秒デバウンス + 失敗時リトライは不変）
- **添削は「添削する」ボタンを押したときだけ**実行する

## 対応方針

### フロントエンド（backend/public/ のみ。バックエンドは変更なし）

1. **index.html**: AI カラム上部のルールボタンを `.ai-toolbar`（flex 行）で包み、右隣に `<button id="correct-button">添削する</button>` を追加する
2. **app.js**:
   - `save()` 末尾の `runCorrection()` 自動呼び出しを削除
   - ボタンクリック → `requestCorrection()`: 保留中の autosave があれば先に確定させてから添削。保存進行中なら `correctRequested` フラグを立て、保存完了時に添削を実行（PUT と POST /correct の順序が入れ替わり古い本文を添削するのを防ぐ）
   - 添削は手動トリガーのみになったため `correctAgain`（添削中の再発火キュー）は削除し、代わりに添削中はボタンを `disabled` にする
   - ボタンが「無反応」に見えないよう、スキップ時に理由をステータス表示: 本文が空 →「英作文が空です」、前回添削から変更なし →「前回の添削から変更がありません」（`lastCorrectedDraft` の変更なしスキップは API コスト節約のため維持）
   - `closeArticle` / `selectArticle` で `correctRequested` をリセット
3. **style.css**: `.ai-toolbar`（flex 行、rules-button を flex:1 に）と `.correct-button`（AI 系バイオレットのプライマリボタン）を追加

## 影響範囲

- `backend/public/index.html` / `js/app.js` / `css/style.css` のみ。API・DB・添削プロンプトは不変
- ルールダイアログを閉じたときの「即保存」は維持されるが、添削はもう走らない（仕様変更どおり）

## テスト方針

- `npm run typecheck`（バックエンド不変の確認）
- ヘッドレス Chromium で:
  1. 本文入力 → 自動保存されるが POST /correct が飛ばないこと
  2. 「添削する」クリック → 添削 API が呼ばれ結果が描画されること
  3. 変更なしで再クリック → スキップ理由の表示
  4. autosave 保留中（入力直後）にクリック → 保存 → 添削の順で実行されること
  5. 検証記事は後始末する
