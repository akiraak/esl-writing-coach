# ./run-server.sh をシェルに戻るようにする

## 目的・背景

ユーザーの要望（2026-11-08）: `./run-server.sh` を実行したら、サーバを起動してシェルに戻るようにする（今は `exec node …` でフォアグラウンドに居座る）。

注意: project-manager は `projects.yaml` の `app.start`（`PORT=3016 ./run-server.sh`）を tmux の中で
`while :; do <start>; …「サーバが終了しました。Enter で起動し直します」; read; done` と回し、**フォアグラウンドで動き続ける前提**でログを見せている
（`~/project-manager/app/src/terminal/terminal.ts` の `appLoop`）。バックグラウンドに回すと、project-manager の画面では起動直後に「終了しました」と出る。

## 対応方針

- **既定はバックグラウンド**: ビルド・ポートを空けるところまでは今と同じ。そのあと `nohup` でサーバを起こし、出力は `logs/server.log` に書く（起動のたびに上書き）
  - ポートで待ち受けるまで待ってから（最大 15 秒）、URL・ログの場所・止め方を出してシェルに戻る
  - 待っている間にサーバが終わったら、ログの末尾を出して失敗で終わる
  - `setsid` は macOS に無いので使わない（`nohup` と `disown` で端末を閉じても残す）
- **`--foreground`**: 今までどおりフォアグラウンドで動かす（project-manager 向け）。project-manager の `projects.yaml` の `app.start` をこれに変える必要がある（別のリポジトリなのでユーザーに確かめてから）
- **`--stop`**: ポートを掴んでいるプロセスを止めるだけ（今の「止めてから起動」の止める部分）
- `logs/` は `.gitignore` に足す

## 影響範囲

- `run-server.sh`・`.gitignore`・`CLAUDE.md`（開発コマンドの表）
- （確認後）`~/project-manager/projects.yaml` の esl-writing-coach の `app.start`

## テスト方針

- 3017 番（`PORT=3017`）で: 既定で起動してすぐシェルに戻る・サーバが応答する・ログに出る・もう一度実行すると前のを止めて起動し直す・`--stop` で止まる・
  `--foreground` は戻らない・起動に失敗するとき（壊れた PORT）はログの末尾を出して失敗で終わる
