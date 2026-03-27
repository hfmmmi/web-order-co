# VPS 本番セットアップ・運用ランブック（貼り付け用）

本番は **Ubuntu LTS + Node + Nginx + Let's Encrypt + systemd** を想定。社内実績（エックスサーバー VPS・サブドメイン）に基づく手順を **コピペ用**にまとめる。  
前提のチェックリストは [production-environment-checklist.md](production-environment-checklist.md)、要点の骨子は [cloud-vps-production-setup.md](cloud-vps-production-setup.md)。  
**初回セットアップ後の運用（リリースの流れ・定期メンテ・障害時の考え方）は「10. 運用フェーズの流れ（詳細）」**。

---

## 1. ローカル（Windows / PowerShell）から VPS へ SSH

**※ 実行場所は自分の PC の PowerShell。** サーバに入ったあとの Linux では `ssh`（Windows 用のパス）は使わない。

### 秘密鍵で接続（例: ed25519）

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 root@VPSのIPアドレス
```

- **ユーザー名**: エックスサーバー VPS の初期例は **`root`**（パネル・マニュアルで確認）。
- 鍵ファイル名が違う場合は `id_ed25519` を実名に合わせる。

### SSH を終了してローカルに戻る

```bash
exit
```

プロンプトが `PS C:\...>` に戻れば、開発用ターミナル（ローカル）に戻った状態。

---

## 2. Phase F 最終確認（VPS 上・root シェル）

```bash
grep SESSION_PATH /opt/weborder/.env
ls -l /opt/weborder/.env
ls -la /var/lib/weborder/sessions
```

- **`SESSION_PATH=...` が1行**あること。
- **`.env` が `-rw-------`（600）**であること。
- **セッション用ディレクトリ**が存在し、権限が適切であること。

`.env` の内容・権限の詳細は [.cursorrules](../.cursorrules) の「本番VPS・Phase F」または [production-environment-checklist.md](production-environment-checklist.md)。

---

## 3. Phase G 概要（完了済み手順の並び）

1. **アプリ疎通**: `cd /opt/weborder && node server.js` → 別 SSH で `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/` → 手動起動は **Ctrl+C** で停止。
2. **Nginx**: `apt install -y nginx` → `/etc/nginx/sites-available/weborder` を作成 → `sites-enabled` に有効化 → `nginx -t` → `systemctl reload nginx`。
3. **DNS**: サブドメイン **のみ** VPS の **A レコード**（**ルートドメインや www の既存 A を変更しない**）。
4. **HTTPS**: `certbot --nginx -d サブドメイン.ドメイン`（メール・規約同意・リダイレクトは対話に従う）。
5. **常駐**: `/etc/systemd/system/weborder.service` → `systemctl daemon-reload` → `systemctl enable --now weborder`。

**`NODE_ENV=production` のブラウザログイン試験は HTTPS 必須**（Secure Cookie）。

---

## 4. Nginx サイト設定の例（HTTP 時・certbot 前のイメージ）

`server_name` と `proxy_pass` を環境に合わせる。certbot 実行後は設定が自動で SSL ブロックを追加されることが多い。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name order.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

有効化の例:

```bash
ln -sf /etc/nginx/sites-available/weborder /etc/nginx/sites-enabled/weborder
# デフォルトサイトと競合する場合
# rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## 5. systemd ユニット例（`weborder.service`）

```ini
[Unit]
Description=web-order Node app
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/weborder
EnvironmentFile=/opt/weborder/.env
ExecStart=/usr/bin/node /opt/weborder/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

反映:

```bash
systemctl daemon-reload
systemctl enable --now weborder
systemctl status weborder
```

---

## 6. DNS（エックスサーバー等）でサブドメインだけ VPS へ向ける

- **対象ドメイン**: 契約ドメイン（例: `example.com`）。
- **追加例**: **ホスト名** `order.example.com`、**種別 A**、**内容 VPS のパブリック IP**、TTL 既定で可。
- **触らない**: ルート `example.com` や `www` の **既存 Web サーバ向け A レコード**（本番サイトを壊さないため）。

### 反映確認（PowerShell）

既定 DNS が **Query refused** になることがある。**公開 DNS に直接聞く**:

```powershell
nslookup order.example.com 8.8.8.8
```

`Address:` に **VPS の IP** が出ればよい。

---

## 7. セキュリティ更新（例: snapd / CVE-2026-3888）

ベンダー・Ubuntu の告知に従う。例（**VPS 上**）:

```bash
apt update
apt install --only-upgrade snapd
reboot
```

**snapd 2.73 未満**が対象とされる場合がある。**`snapd はすでに最新バージョン (2.73+...)`** なら修正版入り。  
その他パッケージは `apt list --upgradable` で確認し、メンテ時間に `apt upgrade` 等。

---

## 8. よく使う確認コマンド（VPS 上）

```bash
systemctl status weborder
systemctl status nginx
journalctl -u weborder -n 50 --no-pager
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

---

## 9. 本番ログイン試験（HTTPS）

1. **`grep '^NODE_ENV=' /opt/weborder/.env`** で `production` を確認。
2. ブラウザで **`https://サブドメイン.ドメイン/`** を開く。
3. **顧客**: 顧客 ID / パスワードでログイン。
4. **管理者**: 同一ログイン画面。**フロント実装（`public/script.js`）では ID が `admin` のとき `/api/admin/login` に振り分け**。実際の管理者 ID が異なる場合は実装と `admins.json` の `adminId` を確認。

---

## 10. 運用フェーズの流れ（詳細）

初回の **Phase F/G（セットアップ）** が終わったあとは **運用フェーズ**。**頻度・目的**ごとに整理する。

### 10.1 コードを変更して本番に反映するとき（都度）

| 手順 | 場所 | 内容 |
|------|------|------|
| 1 | **ローカル** | 修正・`git` でコミット。共同編集は [共同編集の手順.md](共同編集の手順.md)（pull → 編集 → push） |
| 2 | **ローカル** | **`npm run test:api`** を PASS（日常の変更のたび）。大きな変更や本番直前は **`npm run test:all`** を検討（[release-test-discipline.md](release-test-discipline.md)） |
| 3 | **GitHub** | **`main`** にマージ・push（チームのルールに従う） |
| 4 | **VPS（SSH）** | **`git pull` → `npm ci --omit=dev`（依存が変わったとき）→ `systemctl restart weborder`**（下記「11. デプロイ」のコマンド例） |
| 5 | **ブラウザ** | [post-deploy-smoke-test.md](post-deploy-smoke-test.md) に沿った **短い確認** |

**本番 VPS 上では `npm test` / `npm run test:api` を実行しない**（本番 JSON を誤って壊す恐れがあるため）。テストは **ローカルまたは CI**（[release-test-discipline.md](release-test-discipline.md)）。

### 10.2 平常時（デプロイしない日）

- **systemd `weborder`** が **起動維持・異常時の再起動**を担当する。
- **Nginx** は設定を変えない限り **そのまま**でよい。
- **毎日 SSH する必要はない**（障害対応・更新作業のときだけ接続でよい）。

### 10.3 定期的・必要に応じたメンテナンス

| 種類 | 目安 | 内容 |
|------|------|------|
| **OS / パッケージ** | 月1回程度、または **Ubuntu・VPS ベンダーのセキュリティ告知** | [cloud-vps-production-setup.md](cloud-vps-production-setup.md) の「定期保守」。VPS 上で `apt update` → `apt upgrade` 等。カーネル更新後は **再起動**が必要になることがある |
| **個別パッケージ** | 告知に従う | 例: snapd のセキュリティ更新（「7. セキュリティ更新」）。`apt list --upgradable` で保留を確認 |
| **証明書（HTTPS）** | 自動 | **certbot** の **systemd timer** が更新を試行。失敗時は **`/var/log/letsencrypt/`** やメールで気づけるようにする |
| **ディスク** | 余裕があれば | `df -h` でログ・業務データの肥大を確認 |

### 10.4 バックアップ・復旧

- **バックアップ対象・頻度・保管先**は [backup-and-restore-policy.md](backup-and-restore-policy.md) で決める。
- **復旧時にどれくらい古いデータに戻るか（RPO）** を社内で共有しておくと、トラブル時の説明がしやすい。

### 10.5 障害・メンテの「人の側」（一度決める）

[operational-risk-index.md](operational-risk-index.md) のとおり、次を **ルール化**しておく（毎日の作業ではない）:

- **障害時**: 誰が「調査中／復旧見込み」を連絡するか。
- **メンテでサービスを止めるとき**: 事前周知の要否・方法。
- **バックアップと RPO**: 上記 10.4 とセットで共有。

### 10.6 困ったときの切り分け（最短）

| 症状 | まず確認 |
|------|----------|
| **サイトが開かない** | `systemctl status weborder` / `systemctl status nginx` → **`journalctl -u weborder -n 50 --no-pager`**（「8. よく使う確認コマンド」） |
| **502 Bad Gateway** | **`weborder` が active か**、VPS 上で **`curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/`** |
| **ブラウザで証明書エラー** | 期限・**certbot** ログ。メンテ時に `certbot renew --dry-run`（VPS 上） |
| **アプリの 500 や想定外の挙動** | `journalctl`、直近の **`git pull` / 設定変更**の差分 |

---

## 11. デプロイ（コード更新の典型・コマンド）

VPS 上（パスは環境に合わせる）:

```bash
cd /opt/weborder
git pull
npm ci --omit=dev
systemctl restart weborder
```

Nginx の設定を変えたときだけ **`nginx -t && systemctl reload nginx`**。

**本番の JSON データ**が `git pull` で上書きされないよう、**`.gitignore` と運用**を守る。  
デプロイ後は [post-deploy-smoke-test.md](post-deploy-smoke-test.md) を推奨。

---

## 12. 参照一覧

| 文書 | 用途 |
|------|------|
| [operational-risk-index.md](operational-risk-index.md) | 運用・バックアップ・テストの入口 |
| [release-test-discipline.md](release-test-discipline.md) | 本番前の `test:api` / `test:all`・本番でテストしない理由 |
| [post-deploy-smoke-test.md](post-deploy-smoke-test.md) | デプロイ直後の手動確認 |
| [session-production.md](session-production.md) | `SESSION_PATH` 詳細 |
| [backup-and-restore-policy.md](backup-and-restore-policy.md) | バックアップ方針 |
