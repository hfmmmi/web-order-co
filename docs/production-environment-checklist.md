# 本番環境チェックリスト（デプロイ前・更新時）

[`.env.example`](../.env.example) と [session-production.md](session-production.md) を基にした **1枚チェック** です。項目にチェックを入れてから本番反映してください。

---

## 必須（未設定・誤設定で障害やセキュリティリスクになりやすい）

- [ ] **`SESSION_SECRET`** … 推測困難な長いランダム文字列（本番専用）。未設定時は開発用既定値のため **本番では必須**。
  - 生成例: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] **`NODE_ENV=production`** … Cookie の `secure`（HTTPS 時のみ送信）など本番挙動に必須。
- [ ] **`MAIL_PASSWORD`** … 本番では SMTP 認証用パスワードを環境変数のみで渡す（`settings.json` に平文保存しない運用）。
- [ ] **`SESSION_PATH`** … **デプロイで消えない永続ディレクトリ**（例: Linux `/var/lib/weborder/sessions`）。**事前に `mkdir` 作成**（自動作成されません）。詳細は [session-production.md](session-production.md)。
- [ ] **HTTPS** … リバースプロキシ（Nginx / Caddy 等）で TLS 終端し、ブラウザからは HTTPS のみ推奨。
- [ ] **`TRUST_PROXY=1` または `true`** … アプリがリバースプロキシの**内側**で動いているとき必須。Cookie の secure 判定や `req.ip` が正しくなります（[server.js](../server.js)）。

---

## 条件付き（構成によって必要）

- [ ] **`ALLOWED_ORIGINS`** … フロントと API を**別オリジン**に分ける場合のみ、カンマ区切りで指定。同一オリジン運用なら未設定でよい。

---

## 任意（トラブルシュート用）

- [ ] **`ENABLE_PERF_LOG=true`** … 遅いリクエストをログに出す（本番デバッグ用）。
- [ ] **`PERF_LOG_THRESHOLD_MS`** … 上記のしきい値（ミリ秒）。未指定時は実装既定に従う。

---

## データとデプロイ（人的ミス防止）

- [ ] 業務用 JSON・`SESSION_PATH`・`DATA_DIR`（本番でデータを分離している場合）が、**アプリの git デプロイで上書き・削除されない**場所にある。
- [ ] 本番サーバー上で **`npm test` / `npm run test:all` を実行しない**（テストはローカルまたは CI で、`DATA_DIR` 付き。手順は [test-execution.md](test-execution.md)）。

---

## デプロイ直後

- [ ] [post-deploy-smoke-test.md](post-deploy-smoke-test.md) のスモークテストを実施し、記録欄に日付を記入。

---

## 参照

- [vps-production-runbook.md](vps-production-runbook.md) … **本番 VPS の作業手順（SSH・DNS・Phase F/G・systemd・コピペ用）**
- [cloud-vps-production-setup.md](cloud-vps-production-setup.md) … VPS 上での具体的な組み立て例  
- [backup-and-restore-policy.md](backup-and-restore-policy.md) … バックアップと復旧
