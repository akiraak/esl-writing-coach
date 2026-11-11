# TODO

## 設計

（なし）

## 実装（MVP）

- [ ] STEP 3 で AI に自由に質問できるようにする（右ペインの AI に「AI に質問」のカード） [plan](docs/plans/draft-chat.md)
  - [x] Phase 1: プロンプトと出力の検証（`src/ai/draft-chat.ts`）
  - [x] Phase 2: 保存と API（DB の版 3 で `draft_questions`）
  - [x] Phase 3: 画面（カード・段階ごとの並び・質問の欄の使い回し）
  - [x] Phase 4: 本物の API で確かめる
  - [ ] Phase 5: 後片付け（CLAUDE.md・archive）— **CLAUDE.md の更新だけ残っている**（別のセッションからの依頼では CLAUDE.md を書き換えないため。書く内容の案はプランの「Phase 5 の残り」。入れたらプランを archive へ、この項目を DONE.md へ）

## 後で

- [ ] AI の理由・例の候補をマップに直接足す（結論の前に入れる・空なら意見から・Ctrl+Z で戻せる。メモは [plan](docs/plans/archive/ideas-outline.md) の「後でやること」）
- [ ] AI の掘り下げの問い（選んでいる項目について考えを引き出す問い。作るか決める）
