# 認証の導入: Cloudflare Access で Google 認証 + 複数ユーザー対応

## 目的・背景

現在は認証なしのローカル専用ツールで、articles テーブルにユーザーの概念がない。
外部（自宅外・スマホなど）からも安全に使えるようにするため、以下を行う。

- **Cloudflare Access（Zero Trust）+ Google 認証**でアプリ全体を保護する
  （TODO の「Claude Flare」は Cloudflare の表記ゆれと解釈）
- アプリを**複数ユーザー対応**にする: ユーザーごとに記事を分離し、他人の記事は見え
  ない・触れないようにする

### 方式の選定理由

認証をアプリ内に実装する（Passport + Google OAuth など）のではなく、Cloudflare
Access に外出しする。

- アプリ側にセッション管理・OAuth フロー・ログイン画面が不要になり、ビルドなし・
  素の HTML+JS という現構成を保てる
- Cloudflare Tunnel（cloudflared)経由で公開すればポート開放も不要
- アプリは Cloudflare が付与する JWT（`Cf-Access-Jwt-Assertion` ヘッダ）を検証して
  メールアドレスを取り出すだけでよい

## 対応方針

### Phase 1: Cloudflare 側の設定（手作業・ドキュメント化）

コード外の設定作業。手順を `docs/specs/cloudflare-access-setup.md` に記録する。

1. Cloudflare Zero Trust で Google を IdP（ログイン方法）として追加
2. `cloudflared` で Tunnel を作成し、`localhost:3013` を任意のホスト名
   （例: `esl.<自分のドメイン>`）へ公開
3. Access アプリケーションを作成し、対象ホスト名に紐付け
   - ポリシー: Allow、許可するメールアドレスを列挙（当面は自分 + 家族など想定）
   - ログイン方法は Google のみ
4. Access アプリの **AUD（Application Audience タグ）** と **チームドメイン**
   （`https://<team>.cloudflareaccess.com`）を控える → Phase 2 の環境変数になる

### Phase 2: バックエンドの JWT 検証ミドルウェア

Cloudflare を素通りしてローカルポートへ直接アクセスされるケースに備え、ヘッダを
信用せず**JWT 署名を必ず検証**する。

- `jose` を依存に追加（JWKS 取得と JWT 検証。軽量でビルド不要）
- `backend/src/auth.ts` を新設
  - `Cf-Access-Jwt-Assertion` ヘッダの JWT を、チームドメインの
    `/cdn-cgi/access/certs`（JWKS）で検証（`jose` の `createRemoteJWKSet` が
    キャッシュとローテーションを面倒見る）
  - `iss` がチームドメイン、`aud` が Access アプリの AUD と一致することを確認
  - 検証 OK なら `email` クレームを取り出し `req` に載せる（`res.locals.userEmail`）
  - NG は 401 を返す
- `config.ts` に追加する環境変数
  - `CF_ACCESS_TEAM_DOMAIN`: 例 `https://<team>.cloudflareaccess.com`
  - `CF_ACCESS_AUD`: Access アプリの AUD タグ
  - `DEV_USER_EMAIL`: **ローカル開発用フォールバック**。Cloudflare 設定 2 変数が
    未設定のときのみ有効で、全リクエストをこのメールのユーザーとして扱う
    （未設定かつ Cloudflare 設定もなしなら起動時エラーにし、認証なし公開を防ぐ）
- 適用範囲: `/api/` 全体 + 静的配信の前（HTML 自体は Access が守るので API だけ
  でも実害はないが、一律にかけて考えることを減らす。静的アセットは検証コスト
  ほぼゼロなので問題ない）

### Phase 3: DB のマルチユーザー化

- `users` テーブルを新設
  - `id INTEGER PK` / `email TEXT NOT NULL UNIQUE` / `created_at TEXT NOT NULL`
  - 初回リクエスト時にメールアドレスで upsert して自動プロビジョニング
    （Access のポリシーで許可された人だけが到達するため、アプリ側の招待制は不要）
- `articles` に `user_id INTEGER NOT NULL REFERENCES users(id)` を追加
  - `migrate()` に追いつきマイグレーションを追加: `user_id` カラムが無ければ追加し、
    既存記事は `OWNER_EMAIL` 環境変数（＝自分のメール）のユーザーを作成して割当。
    移行完了後は `OWNER_EMAIL` は不要
- `repo.ts` の全関数に `userId` を追加し、SELECT / UPDATE / DELETE を
  `WHERE user_id = ?` でスコープする（他人の記事は 404 に見える）
- `routes/articles.ts` は `res.locals` のユーザーを各 repo 呼び出しに渡す

### Phase 4: フロントエンドの最小対応

- `GET /api/me` を追加（ログイン中のメールを返す）
- サイドバー下部などにログイン中メールを小さく表示
- ログアウトリンク（`/cdn-cgi/access/logout` への遷移。Cloudflare 経由時のみ機能
  するため、DEV フォールバック時は非表示 or 無効表示）
- それ以外の画面・API 呼び出しは無変更（Cookie は Cloudflare が管理し、fetch は
  same-origin なので自動で付く）

## 影響範囲

- 追加: `backend/src/auth.ts`、`docs/specs/cloudflare-access-setup.md`
- 変更: `backend/src/config.ts`（環境変数追加）、`backend/src/index.ts`（ミドル
  ウェア適用 + `/api/me`）、`backend/src/db/schema.sql`・`db/index.ts`（users /
  user_id マイグレーション）、`backend/src/db/repo.ts`・`routes/articles.ts`
  （userId スコープ）、`backend/public/`（メール表示・ログアウト）
- 依存追加: `jose`
- 運用: `.env` に `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`（本番）または
  `DEV_USER_EMAIL`（ローカル）。cloudflared の常駐（systemd サービス化は手順書に記載）

## テスト方針

- `npm run typecheck`
- ローカル（DEV フォールバック）: `DEV_USER_EMAIL` を変えて起動し直すと記事一覧が
  ユーザーごとに分かれること、既存記事が `OWNER_EMAIL` のユーザーに移行されている
  ことを確認（DB ファイルをコピーした上でマイグレーションを検証）
- JWT 検証: 単体レベルで「ヘッダなし → 401」「不正 JWT → 401」を curl で確認。
  正規 JWT の検証は Cloudflare 経由の実アクセスで確認（`cloudflared` 設定後、
  ブラウザで Google ログイン → 記事一覧が出る / 未許可メールは Access に弾かれる）
- ヘッドレス Chromium でメール表示・ログアウトリンクの表示確認とスクリーンショット

## 検討事項・決めごと

- 記事の共有機能は入れない（ユーザー間は完全分離）
- Access のセッション長は Cloudflare 側設定（デフォルト 24h 程度）に任せる
- 将来ユーザーが増えても Access ポリシーにメールを足すだけ。アプリ側の管理画面は作らない
