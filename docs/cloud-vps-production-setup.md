# クラウド VPS 本番セットアップ（要点）

クラウドの仮想サーバー1台に本システムを載せる場合の **フェーズ1** 手順の骨子です。ベンダー（AWS Lightsail、さくら、ConoHa 等）の公式手順と併用してください。

前提: [production-environment-checklist.md](production-environment-checklist.md) の項目を満たす。

---

## 1. サーバー準備

- [ ] OS: **Ubuntu LTS** 等、長期サポート版を推奨。
- [ ] **固定パブリック IP** を付与（ドメインの A レコード用）。
- [ ] **SSH 鍵認証**を有効にし、パスワードログインは無効化推奨。
- [ ] **ファイアウォール（UFW 等）**: 外向きは **22（SSH・必要なら自分の IP のみ）/ 80 / 443** に限定。Node のポート（例: 3000）は **外部に開けず**、リバースプロキシから `127.0.0.1` のみで接続。

---

## 2. ランタイムとアプリ

- [ ] **Node.js**（リポジトリが想定する版。CI は Node 20 参照: `.github/workflows/ci.yml`）。
- [ ] リポジトリを配置し、`npm ci`（本番）または `npm install`。
- [ ] 本番用 **`.env`** を配置（チェックリストの変数）。**リポジトリにコミットしない。**

---

## 3. 永続ディレクトリ

- [ ] **`SESSION_PATH`** 用ディレクトリを作成（例: `sudo mkdir -p /var/lib/weborder/sessions`、権限は実行ユーザに合わせる）。
- [ ] 業務データ（`DATA_DIR` を使う場合はそのパス、使わない場合はアプリ配下の JSON）が **デプロイスクリプトで削除されない**こと。

---

## 4. リバースプロキシと HTTPS

- [ ] **Nginx または Caddy** で:
  - ドメインに対する **TLS 証明書**（Let's Encrypt 等）。
  - `https://` → `http://127.0.0.1:3000`（またはアプリの `PORT`）へ **プロキシ**。
- [ ] アプリ側で **`TRUST_PROXY=1`**（または `true`）を設定。
- [ ] **`NODE_ENV=production`**。

---

## 5. プロセス常駐

いずれかで **OS 起動時・クラッシュ後の自動再起動** を設定する。

- **PM2** 例: `pm2 start server.js --name weborder` → `pm2 save` → `pm2 startup`
- **systemd** 例: `User` / `WorkingDirectory` / `EnvironmentFile` / `ExecStart=/usr/bin/node server.js` のユニットファイル

---

## 6. メール確認（本番）

- [ ] **`MAIL_PASSWORD`** を設定したうえで、**パスワード再設定メール**または**注文通知**のテストを1通送る。
- [ ] 届かない場合は SMTP 設定・迷惑メール判定・送信元ドメインの **SPF/DKIM**（DNS 側）を確認。

---

## 7. CAPTCHA（利用している場合）

- [ ] 本番ドメインが **reCAPTCHA（または利用中のサービス）の許可リスト**に含まれる。
- [ ] 本番用の **サイトキー・シークレット** を本番環境だけに設定。

---

## 8. 検証の順序（初回）

1. `curl -I https://あなたのドメイン` で 200 前後と証明書エラーなし。  
2. ブラウザで顧客トップ・ログイン。  
3. 管理画面ログイン。  
4. [post-deploy-smoke-test.md](post-deploy-smoke-test.md) を実施。

---

## 9. 定期保守（OS）

**初回だけでなく、運用中も繰り返す保守**です。メンテナンス時間帯に実施すること。

- [ ] **`apt update && apt upgrade -y`**（または対話で確認するなら `apt upgrade`）  
  - セキュリティ修正の適用のため、**月1回程度**、または Ubuntu の重要な脆弱性情報が出たタイミングで実施するのが目安。  
  - 本番では変更内容を把握できるよう、必要に応じて事前に `apt list --upgradable` で確認してからでもよい。
- [ ] **`reboot`**  
  - ログイン時の案内に **`* System restart required *`** や **カーネル更新後の再起動が必要** と出たときに実施。  
  - 毎週必須ではない。**再起動後**は SSH・Web・常駐プロセス（PM2 / systemd）が意図どおり戻るか確認する。

**補足:** パッケージ更新と再起動は **自分の PC（Windows）の PowerShell ではなく、サーバに SSH ログインしたシェル**（`root@...#` など）で実行する。接続を終了するときは `exit`。Windows からサーバへ接続するときだけ `ssh -i %USERPROFILE%\.ssh\id_ed25519 root@サーバIP`（PowerShell では `$env:USERPROFILE\.ssh\id_ed25519`）を使う。

---

## 参照

- [session-production.md](session-production.md) … `SESSION_PATH` の詳細  
- [backup-and-restore-policy.md](backup-and-restore-policy.md) … スナップショットとファイルコピー
