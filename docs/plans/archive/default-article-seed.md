# デフォルト記事のシード（ルールとユーザー入力を事前に入れておく）

## 目的・背景

- 新しいユーザーが初めてログインすると記事一覧が空で、何をどう書けばいいか（ルール欄の使い方・日本語混在で書けること）が伝わらない
- デフォルトで 1 件のサンプル記事を用意し、**ルール**と**ユーザーの英作文（draft）** を事前に入れておくことで、開いてすぐアプリの使い方が分かる状態にする
- 新規ユーザーだけでなく、**既存ユーザーにも**（次回アクセス時に）同じサンプル記事を 1 回だけ入れる

## 対応方針

### シードのタイミング

- users テーブルに `seeded_at TEXT`（NULL 可）カラムを追加し、「サンプル記事を入れたか」をユーザー単位で記録する
- `repo.getOrCreateUser()` でユーザーを解決したあと、`seeded_at IS NULL` ならサンプル記事を 1 件 INSERT して `seeded_at` を立てる（INSERT と更新は同一トランザクション）
  - 新規ユーザーは初回アクセス時、既存ユーザーは次回アクセス時に 1 回だけシードされる
  - 一度シードしたら、ユーザーが記事を消しても再シードはしない（消したものが勝手に復活すると不気味なため）。すでに自分の記事を持っている既存ユーザーにも入れる（一覧の並びは updated_at DESC なので、古い updated_at を付ければ既存記事の下に並ぶ）
- マイグレーション: `db/index.ts` の `migrate()` に「users に `seeded_at` カラムが無ければ `ALTER TABLE users ADD COLUMN seeded_at TEXT`」を追加（NULL 可カラムなので単純な ALTER で足りる）。新規 DB 用に `schema.sql` にもカラムを追加

### シード内容

- `corrected` / `advice` / `corrected_at` は空のまま（添削はユーザーが自分の操作で体験する。起動時に LLM を呼ばない）
- 内容はコード内の定数（`src/db/seed.ts` など小さな別ファイル）に持つ。案:

**rules（案）:**

```
- カジュアルすぎない自然なアメリカ英語にしてください
- CEFR B1 くらいの語彙を優先し、難しい表現には簡単な言い換えを添えてください
- 全体で 100 語前後にまとめてください
```

**draft（案）: 日本語混在で書けることが伝わる自己紹介文**

```
Hello! My name is Akira. I started learning English again this year.
最近は毎朝 30 分、英語で日記を書くようにしています。
My goal is to write emails to my coworkers without using a translator.
このアプリでは、日本語で書いた部分も英語にしてもらえるので便利です。
```

（文面は実装時に微調整してよい。ユーザー名など個人固有の情報はサンプルらしい一般的な表現にする）

## 影響範囲

- `backend/src/db/seed.ts`（新規）: シード内容の定数と `seedDefaultArticle(userId)` 相当の関数
- `backend/src/db/repo.ts`: `getOrCreateUser()` で `seeded_at IS NULL` のユーザーにシードを入れて `seeded_at` を更新
- `backend/src/db/schema.sql` / `backend/src/db/index.ts`: users への `seeded_at` カラム追加（新規 DB / 既存 DB マイグレーション）
- フロントエンド・API は変更なし

## テスト方針

- `npm run typecheck`（backend）
- DEV モードで一時 DB（または `DEV_USER_EMAIL` を未使用のメールに変更）を使い、新規ユーザー初回アクセスで:
  - 記事一覧にサンプル記事が 1 件あり、rules / draft が入っていること
  - corrected / advice が空・corrected_at が null であること
  - 2 回目以降のアクセスで記事が増えない（重複シードしない）こと
  - シード記事を削除して再アクセスしても復活しないこと
- 実 DB（既存ユーザーが記事を持つ状態）で:
  - マイグレーションで `seeded_at` カラムが追加されること
  - 次回アクセスでサンプル記事が 1 件追加され、既存記事はそのまま・一覧の並びが壊れないこと
  - さらに次のアクセスで記事が増えないこと
- ヘッドレス Chromium で一覧と編集画面の表示を確認
