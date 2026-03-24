# バックアップと復旧方針（テンプレ）

業務データは主に **`dbPaths.js`**（環境変数 **`DATA_DIR`** 未指定時はプロジェクトルート）配下の JSON と、`logs/`、`SESSION_PATH`、`.gitignore` 対象のトークン類です。**Git にコミットされないデータは Git では復元できません。**

---

## 1. 方針を決める（記入欄）

| 項目 | 自社の決定（例を書き換え） |
|------|---------------------------|
| **頻度** | 例: スナップショット毎日 / ファイルコピー毎日深夜 |
| **保管先** | 例: クラウドの別リージョンストレージ、別 VPS、NAS |
| **保持期間** | 例: 7 日分ローリング、月末1本は3ヶ月 |
| **担当** | 例: 保守担当者名 |
| **RPO（目安）** | 例: 最大 24 時間分のデータが戻る |
| **RTO（目安）** | 例: 半日以内に再開 |

---

## 2. クラウドスナップショット（インフラ）

- [ ] VPS プロバイダの **ディスクスナップショット**を定期取得（ウィークリー最低、デイリー推奨）。
- 復習: 月1回、コンソールから **スナップショットから復元する手順** を読む（実際に復元するかは任意）。

---

## 3. 業務 JSON・その他ファイル（アプリ整合）

`DATA_DIR` を本番で設定している場合は **`DATA_ROOT` 配下すべて** をコピー対象に含める。

### 3.1 典型的にバックアップ対象になるファイル（参考一覧）

プロジェクト構成により増減します。実際のパスは **`DATA_DIR` の有無**で決まります（[dbPaths.js](../dbPaths.js)）。

- 顧客・注文・商品・価格・設定など: `customers.json`, `orders.json`, `products.json`, `prices.json`, `rank_prices.json`, `rank_prices_updated_at.json`, `settings.json`, `stocks.json`, `admins.json`, `kaitori_master.json`, `kaitori_requests.json`, `support_tickets.json` 等
- トークン・レート制限等（`.gitignore` されがち）: `invite_tokens.json`, `reset_tokens.json`, `admin_reset_tokens.json`, `login_rate_limit.json`, `reset_rate_limit.json`, `proxy_requests.json` 等
- ログ・監査: `logs/` 配下（`admin-auth.json`, `customer-auth.json` 等）
- セッション: **`SESSION_PATH`** で指定したディレクトリ全体（復旧方針次第で省略可）
- 添付: `support_attachments/` 等（利用している場合）

### 3.2 コピー方法の例

- `rsync` / プロバイダのオブジェクトストレージへのアップロード / 圧縮アーカイブの退避  
- **アプリを停止してから** 一貫性を取るか、または低負荷時間帯に取得（完全厳密にはメンテナンスウィンドウ推奨）。

---

## 4. 復旧手順（チェックリスト）

障害時にこの順で確認する。

1. [ ] 障害の種類: ディスク破損 / 誤削除 / 不正JSON / 全損 など。
2. [ ] **最新の正常バックアップ**の日時を確認。
3. [ ] アプリを停止。
4. [ ] 対象ファイルまたはボリュームを **バックアップの内容で上書き**（またはスナップショットからボリューム差し替え）。
5. [ ] `SESSION_PATH` を復旧した場合、古いセッションで **Cookie 不整合**が出ることがある → 顧客には再ログイン案内。
6. [ ] アプリ起動、ログにエラーがないか確認。
7. [ ] [post-deploy-smoke-test.md](post-deploy-smoke-test.md) に相当する確認を実施。

---

## 5. 過去の教訓（リポジトリ内ドキュメント）

- E2E・テストが **本番データディレクトリを触らない**こと: [調査メモ_顧客アドレス消失.md](調査メモ_顧客アドレス消失.md)、[test-execution.md](test-execution.md)  
- `support_tickets.json` はリポジトリ上プレースホルダのため **Git から実データ復元不可**（.cursorrules 記載）→ **バックアップ必須**

---

## 6. 技術的な「次の段階」（任意）

高負荷や複数サーバで JSON の限界が問題になった場合は [optional-scaling-json-followup.md](optional-scaling-json-followup.md) と [REFACTOR_INVENTORY.md](../REFACTOR_INVENTORY.md) を参照。
