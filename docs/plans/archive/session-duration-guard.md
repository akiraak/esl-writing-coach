# Session Duration「なし」対策（リロードループ防止 + 設定手順の追記）

## 目的・背景

本番の「通信エラー」の根本原因が判明: Access アプリの **Session Duration が
「No duration, expires immediately（なし）」** に設定されていた。この設定では
セッションが即時失効し、リクエストごとに再認証が要求される。ページ遷移は
リダイレクトで再認証できるが、fetch はクロスオリジンリダイレクトを辿れないため
API 呼び出しが常に失敗する。

さらにこの状態では、前回入れたセッション切れの自動リロードが
「リロード → 直後の API も失敗 → またリロード」の無限ループになり得る。

## 対応方針

1. **リロードループのガード**（`backend/public/js/app.js`）
   - 再認証リロードの実行時刻を sessionStorage に記録し、30 秒以内の再発火では
     リロードせず「ログインセッションが維持できません。Cloudflare Access の
     Session Duration 設定を確認してください」をエラー表示する
2. **設定手順の追記**（`docs/specs/cloudflare-access-setup.md`）
   - Access アプリ作成手順に Session Duration の推奨値（例: 1 week）と、
     「No duration, expires immediately」にすると API が全滅する旨の注意を追記
3. 実際の設定変更（ダッシュボードで Session Duration を 1 week 等へ）は
   akiraak の手作業。TODO に残す

## 影響範囲

フロントの reloadForReauth() と設定ドキュメントのみ。バックエンド変更なし。

## テスト方針

ヘッドレス Chromium でセッション切れを偽装し続けた場合に、リロードが 1 回で止まり
ガードのエラーメッセージが表示されること。通常のセッション切れ（1 回で回復）の
挙動が変わらないこと。
