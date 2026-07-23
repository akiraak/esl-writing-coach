# TODO

- [ ] Cloudflare Access の Session Duration を「No duration, expires immediately」から **1 week** 等へ変更する（akiraak 手作業。Zero Trust → Access → Applications → esl-writing-coach → 設定。「なし」だと fetch が全て通信エラーになる。手順: [docs/specs/cloudflare-access-setup.md](docs/specs/cloudflare-access-setup.md)）

- [ ] モバイル対応: iPhone 実機での表示・動作確認（https://esl-writing.chobi.me/ 。本番反映は 2026-07-23 に e3956a2 まで完了）