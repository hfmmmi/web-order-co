# リファクタ棚卸し（フェーズ0）

生成日: 計画実装時点。`npm run test:api` 前提のホットスポット一覧。

## 行数（上位）

| パス | 行数 |
|------|------|
| public/js/admin-products.js | 1052 |
| routes/admin-api.js | 961 |
| routes/auth-api.js | 952 |
| public/js/admin-settings.js | 822 |
| public/js/admin-customers.js | 677 |
| services/priceService.js | 610 |
| public/js/admin-orders.js | 563 |
| services/settingsService.js | 541 |
| services/orderService.js | 539 |
| services/csvService.js | 482 |
| routes/products-api.js | 462 |
| public/js/admin-orders-view.js | 438 |
| public/js/admin-kaitori.js | 401 |
| routes/orders-api.js | 351 |
| server.js | 213 |

## ルート数（`router.get|post|put|patch|delete`）

| ファイル | 件数 |
|----------|------|
| routes/admin-api.js | 40 |
| routes/orders-api.js | 14 |
| routes/auth-api.js | 14 |
| routes/products-api.js | 5 |
| routes/kaitori-api.js | 9 |
| routes/support-api.js | 5 |

## 重複・横断シグナル（grep）

- `regenerateSession` / `saveSession`: **routes/admin-api.js** と **routes/auth-api.js** に同一実装。
- `appendAdminAuthLog` / `appendCustomerAuthLog`: **routes/auth-api.js** 内（抽出候補）。
- `mutateProxyRequests`（旧 load+save パターンの置換）: **utils/proxyRequestsStore.js** 経由で auth-api / customersRoutes 双方。

## 依存の向き

- `routes → services → utils` が主。ルート間の相互 require はなし（確認済み）。

## テストの当たり先（ざっくり）

- `tests/s-rank`, `tests/a-rank`, `tests/b-rank`, `tests/risk-driven`: auth-api / admin-api / orders / products を広くカバー。
- E2E: `tests/e2e/specs/admin-*.spec.js` 等で管理画面。

## 実装後メモ（計画反映済み）

- 管理者API: [routes/admin-api.js](routes/admin-api.js) は `routes/admin/*Routes.js` へ分割。
- セッション Promise: [utils/sessionAsync.js](utils/sessionAsync.js)。監査ログ: [services/authAuditLogService.js](services/authAuditLogService.js)。
- パスワード再設定依頼: [services/passwordResetRequestService.js](services/passwordResetRequestService.js)。
- server ミドルウェア: [middlewares/helmetIfAvailable.js](middlewares/helmetIfAvailable.js) 他。
- 管理画面 fetch ラッパ: `window.adminApiFetch`（[public/js/admin-common.js](public/js/admin-common.js)）、`admin-customers.js` / `admin-products.js` で利用。
- **JSON 直列化**: [utils/jsonWriteQueue.js](utils/jsonWriteQueue.js) の `runWithJsonFileWriteLock` を、`login_rate_limit.json`（[routes/auth/loginRateLimit.js](routes/auth/loginRateLimit.js)）、[utils/proxyRequestsStore.js](utils/proxyRequestsStore.js) の `mutateProxyRequests`、[routes/kaitori-api.js](routes/kaitori-api.js)、[routes/support-api.js](routes/support-api.js)、[services/stockService.js](services/stockService.js) の `stocks.json` 更新に適用済み。
- **認証ルート分割**: レート制限・reCAPTCHA・管理者名サニタイズは [routes/auth/loginRateLimit.js](routes/auth/loginRateLimit.js)、[routes/auth/recaptcha.js](routes/auth/recaptcha.js)、[routes/auth/sanitizeAdminName.js](routes/auth/sanitizeAdminName.js)。
- **在庫表示ロジック**: [utils/stockPresentation.js](utils/stockPresentation.js)（[routes/products-api.js](routes/products-api.js) から利用）。
- **管理画面 JS 分割**: [public/js/admin-products-stock.js](public/js/admin-products-stock.js)、[public/js/admin-settings-dataformats.js](public/js/admin-settings-dataformats.js)（`window.AdminSettingsDataFormats`）。

## JSON 書き込み棚卸し（プロセス内キュー未適用の例）

単一 Node プロセス内では `runWithJsonFileWriteLock` で競合を緩和できるが、以下は**未対応のまま**または**別経路**のため、高負荷・並行時は引き続きリスクがある。

- `orders.json`: [services/orderService.js](services/orderService.js) は独自 `_withOrdersWriteLock`。
- `customers.json` / `products.json` / `prices.json` / `invite_tokens.json` / 設定ファイル等: 各サービス・ルートの read-modify-write は随時見直し候補。
- **マルチプロセス**（クラスタ・複数インスタンス）ではいずれの Promise キューも**プロセス間で共有されない**。本番で水平スケールする場合は SQLite 等の共有ストアまたはファイルロック付きアクセスが必要。
