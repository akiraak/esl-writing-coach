# Cloudflare Access セッション切れの自動リカバリ

## 目的・背景

本番（esl-writing.chobi.me）のモバイルで「記事の作成に失敗しました（通信エラー）」が発生。
調査の結果、未認証状態では Cloudflare Access が GET/POST とも
`https://akiraak.cloudflareaccess.com/...` への 302 を返すことを確認（curl で実測）。
fetch はこのクロスオリジンリダイレクトを CORS エラー（TypeError = 通信エラー）として失敗させる。

つまり症状は **Access のログインセッション切れ**。モバイルではタブを開き直すと
bfcache で画面（記事一覧など）はそのまま復元されるが cookie は期限切れ、という状況が
起きやすく、以後の fetch が全て通信エラーになる。ページを再読み込みすれば
Access のリダイレクトフローで再認証される（Google セッションが生きていれば無操作で戻る）。

## 対応方針（フロントのみ）

1. **API fetch を `apiFetch()` ラッパーに集約**
   - fetch が TypeError で落ちたら `/api/me` を `redirect: 'manual'` で probe し、
     `opaqueredirect`（= Access のログインへの 302）ならセッション切れと判定
   - セッション切れなら編集中の内容を localStorage に退避（下記）して `location.reload()`
     （リロードで Access の再認証フローに乗る。URL の ?id= は維持される）
   - probe も失敗する場合は本当の通信エラーなので従来どおりエラー表示
   - 応答が別オリジンへ `redirected` していた場合も同様にセッション切れ扱い
2. **編集内容の退避と復元**（リロードで書きかけを失わないように）
   - 退避: `pendingEdits` キーに { id, rules, draft } を保存
   - 復元: 初期化で記事選択後、id が一致し内容が違うときだけ欄へ反映して自動保存を予約
3. **bfcache 復元時の先回りチェック**: `pageshow` の `persisted` 時にセッションを probe し、
   切れていれば操作前に退避 + リロード

## 影響範囲

`backend/public/js/app.js` のみ（API 呼び出しを apiFetch に置換 + 退避/復元 + pageshow）。
開発モード（Cloudflare なし）ではサーバ停止時に probe も失敗するため従来どおり
「通信エラー」表示になり、挙動は変わらない。バックエンド変更なし。

## テスト方針

ヘッドレス Chromium + リクエストインターセプトで:
1. POST を network エラーに + /api/me を 302（別オリジン）に → 退避 + リロードが走る
2. リロード後に退避内容が復元され自動保存が予約される
3. POST も /api/me も network エラー → 従来どおり「（通信エラー）」表示でリロードしない
4. 通常フロー（新規作成・削除・保存）のリグレッションなし
