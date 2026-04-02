# 分岐カバレッジ 90% — フェーズ3（ルート層の計画的埋め尽くし）

HTTP で再現できる経路は **`supertest` + `server.js` の `app`** で分岐を直接叩く（既存の `tests/**/*-branch*.api.test.js` や `*-coverage*.api.test.js` と同型）。

## 前提

- **優先度の機械一覧**: `npm run coverage:gap-report`（フェーズ2）で `routes/**/*.js` の未取得分岐が多い順を確認する。
- **サンドボックス**: `tests/setupJestDataDir.js` により `DATA_DIR` がテスト用。`tests/helpers/testSandbox.js` の `seedBaseData` / `backupDbFiles` 等を既存テストに合わせる。
- **外部 I/O のモック**: メール等は既存ファイルと同様に `jest.mock("../../services/mailService", ...)` などで安定化する。

## マウント構成（`server.js`）

| プレフィックス | ルータモジュール | 備考 |
|----------------|------------------|------|
| `/api` | `routes/auth-api.js` | 顧客・管理者セッション |
| `/api` | `routes/admin-api.js` | 管理ドメイン（settings / products / customers / prices / orders / stocks） |
| `/` | `routes/products-api.js` | カタログ（`catalogRoutes`） |
| `/` | `routes/orders-api.js` | 注文・CSV・出荷系 |
| `/` | `routes/kaitori-api.js` | 買取 |
| `/` | `routes/support-api.js` | サポート |

**URL の読み方**: 各ファイル内の `router.get("/admin/orders", ...)` は、`admin-api` なら **`/api` + パス** → `GET /api/admin/orders`。`orders-api.js` の `GET /api/download-csv` は **`/` マウント**のため `GET /api/download-csv` のまま。

---

## ルートファイル別インベントリ（網羅のたたき台）

### `routes/auth/customerSessionRoutes.js`（`/api` 付き）

| メソッド | パス（プレフィックス除く） | 認証 |
|----------|----------------------------|------|
| POST | `/login` | 公開 |
| GET | `/session` | セッション |
| GET/POST | `/account/*`, `/logout`, `/setup`, `/request-password-reset` | 分岐により |

### `routes/auth/adminSessionRoutes.js`

| メソッド | パス | 備考 |
|----------|------|------|
| POST | `/admin/login`, `/admin/logout`, `/admin/invite-reset` | |
| GET | `/admin/check` | |

### `routes/admin/settingsRoutes.js`

| メソッド | パス | 備考 |
|----------|------|------|
| GET | `/settings/public` | 公開 |
| GET/PUT | `/admin/settings`, `/admin/account` | `requireAdmin` |

### `routes/admin/productsRoutes.js` / `customersRoutes.js` / `pricesRoutes.js` / `ordersRoutes.js` / `stocksRoutes.js`

- 各ファイル先頭の `router.(get|post|...)` で列挙済み。管理系は **`requireAdmin`** が付くことが多い。
- **分岐が重い既知エリア**（80% 計画・ギャップレポートと整合）: `ordersRoutes`（一覧・エクスポート・import-flam）、`pricesRoutes`（ランク価格・Excel）、`stocksRoutes`（import・manual・parse-excel）。

### `routes/products/catalogRoutes.js`（`/` マウント）

| メソッド | パス | 備考 |
|----------|------|------|
| GET | `/products`, `/products/estimate`, `/products/frequent` | 認証・ページング等 |
| POST | `/cart-details` | |
| GET | `/download-my-pricelist` | |

### `routes/orders-api.js`

| メソッド | パス例 | 備考 |
|----------|--------|------|
| GET | `/orders`, `/order-history`, `/delivery-history`, `/shipper-history` | |
| GET | `/api/download-csv` | キーワード分岐あり |
| POST | `/api/import-shipping-csv`, `/api/import-orders-csv`, `/place-order`, 管理系 POST 複数 | |

### `routes/kaitori-api.js` / `support-api.js`

- 買取・サポート・添付ダウンロード。ファイルサイズ・拡張子・`mv` 失敗など **エラー系分岐**を API テストで取りにいく。

---

## 既存テストの置き場所（参照用・抜粋）

| 狙い | ファイル例 |
|------|----------------|
| 管理・注文・価格 | `tests/a-rank/branch-coverage-admin-orders-prices.api.test.js`, `admin-prices-routes-branch.api.test.js` |
| カタログ | `tests/a-rank/catalog-branch-coverage-80.api.test.js`, `catalog-rank-catch-branches.api.test.js`, `catalog-routes-unauth.api.test.js` |
| CSV キーワード | `tests/a-rank/orders-download-csv-keyword-branches.api.test.js` |
| 在庫 | `tests/a-rank/stocks-routes-branch-coverage-82.api.test.js` |
| サポート | `tests/a-rank/support-api-attachments-branches.api.test.js`, `branch-coverage-92-orders-support-catch.api.test.js` |
| 設定・公開 | `tests/a-rank/settings-routes-public-catch.api.test.js`, `admin-api-coverage.api.test.js` |
| 認証網羅 | `tests/a-rank/auth-api-coverage.api.test.js`, `coverage-auth-orders-admin.api.test.js` |

新規追加時は **`tests/a-rank/`** に寄せ、ファイル名に **対象ルートまたは目的**（例: `orders-api-*.api.test.js`）を含めると検索しやすい。

---

## テスト設計テンプレート（コピー用）

`coverage:gap-report` で上位に出た **`routes/...` ファイル**ごとに、未カバー分岐を埋めるケースを列挙する。

```
対象ファイル: routes/__________.js
参照: coverage/lcov-report/... 該当ファイル

| # | メソッド | URL（フルパス） | 条件（クエリ/ボディ/認証） | 期待ステータス | 狙う分岐のメモ |
|---|----------|-----------------|---------------------------|----------------|----------------|
| 1 | | | | | |
```

**ステータス以外の分岐**（レスポンスボディ・CSV 行の有無）も「狙い」列に書くとレビューしやすい。

---

## ワークフロー（フェーズ3の1サイクル）

1. `npm run coverage:baseline` → `npm run coverage:gap-report` で **`routes/` が上位のファイル**を選ぶ。
2. `lcov-report` で該当ファイルの **赤い分岐**を確認。
3. 上記テンプレに **ケースを書いてから**テストコードを追加（**200 以外**も 401/403/413/500 で意図を明示）。
4. `npm run test:api` で通過とカバレッジ上昇を確認。

---

## フェーズ3の完了条件（このリポジトリでの定義）

次を満たしたら、フェーズ3を一区切りとみなしてよい。

1. **ルート層の進め方**が本ドキュメントとフェーズ2の手順だけで再現できること。
2. `coverage:gap-report` の **上位に残る `routes/` ファイルについて**、テスト設計テンプレまたは既存テストで **未取得が大きいエンドポイントに手が付いている**こと（数値目標はフェーズ1の全体 90% に委ね、ここでは **手順と優先の習慣化**を完了とする）。
3. 新規 API テストが **`tests/helpers/testSandbox`** とデータ方針に沿い、**本番データを汚さない**こと。

---

## 関連ドキュメント

- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ2: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ4（サービス層・ユニット）: `docs/branch-coverage-90-phase4-services.md`
- フェーズ5（ミドルウェア・認証・セッション）: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ6（ストック・CSV・Excel・アダプタ）: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8〜10・全体目次: `docs/branch-coverage-90-index.md`
- 従来の 80% 計画・優先ファイル: `docs/branch-coverage-80-plan.md`
