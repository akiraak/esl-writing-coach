# Cloudflare Access セットアップ手順（Google 認証）

アプリを Cloudflare Access（Zero Trust）+ Google 認証で保護し、Cloudflare Tunnel で
外部公開するための手作業手順。アプリ側の実装は
[docs/plans/archive/google-auth-cloudflare-access.md](../plans/archive/google-auth-cloudflare-access.md) を参照。

## 前提

- Cloudflare アカウントと、Cloudflare で DNS 管理しているドメインがあること
- Zero Trust ダッシュボード: <https://one.dash.cloudflare.com/>（無料プランで可）

## 1. Google を IdP（ログイン方法）として追加

1. Zero Trust ダッシュボード → **Settings → Authentication → Login methods → Add new**
2. **Google** を選択
3. 画面の指示に従い Google Cloud Console で OAuth クライアントを作成
   - <https://console.cloud.google.com/> → APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
     （`<team>` は Zero Trust の Team domain。Settings → Custom Pages で確認）
4. 発行された **Client ID / Client Secret** を Cloudflare 側のフォームに貼り付けて保存
5. **Test** ボタンで Google ログインが通ることを確認

## 2. Cloudflare Tunnel でアプリを公開

サーバー（このアプリを動かすマシン）で:

```bash
# cloudflared のインストール（Ubuntu/Debian）
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared

# ログインと Tunnel 作成
cloudflared tunnel login
cloudflared tunnel create esl-writing-coach
cloudflared tunnel route dns esl-writing-coach esl.<自分のドメイン>
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: esl-writing-coach
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: esl.<自分のドメイン>
    service: http://localhost:3013
  - service: http_status:404
```

常駐化（systemd サービス）:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## 3. Access アプリケーションの作成

1. Zero Trust ダッシュボード → **Access → Applications → Add an application → Self-hosted**
2. Application name: `esl-writing-coach`、Application domain: `esl.<自分のドメイン>`
3. Identity providers: **Google のみ**にチェック（One-time PIN は外す）
4. ポリシーを作成
   - Action: **Allow**
   - Include → Selector: **Emails** → 許可するメールアドレスを列挙（自分 + 家族など）
5. 保存

ユーザーを増やすときは、このポリシーの Emails にアドレスを足すだけでよい
（アプリ側は初回アクセス時に自動でユーザーを作成する）。

## 4. アプリの環境変数を設定

Access アプリの詳細画面（Overview タブ）で **Application Audience (AUD) Tag** をコピーし、
サーバーの `backend/.env` に設定する:

```bash
# 本番（Cloudflare 経由）
CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
CF_ACCESS_AUD=<AUD タグ（64 桁の hex）>

# 既存記事の移行（初回起動時のみ必要。user_id マイグレーション完了後は削除してよい）
OWNER_EMAIL=<自分のメールアドレス>
```

`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` が設定されていると、アプリは全リクエストで
`Cf-Access-Jwt-Assertion` ヘッダの JWT を検証する（ローカルポートへの直接アクセスは 401）。
未設定の場合は `DEV_USER_EMAIL` によるローカル開発用フォールバックになる。

## 5. 動作確認

- ブラウザで `https://esl.<自分のドメイン>` を開く → Google ログイン画面 → 許可した
  メールでログイン → 記事一覧が表示される
- 許可していない Google アカウントでは Access にブロックされる
- サイドバー下部にログイン中メールが表示され、「ログアウト」リンクで
  `/cdn-cgi/access/logout` に飛んでセッションが切れる
- `curl http://localhost:3013/api/articles` （ヘッダなし直アクセス）が 401 を返す
