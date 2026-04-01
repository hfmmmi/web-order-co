# 分岐カバレッジ 80% 達成計画

**現状（2026-04-01 計測）**: `npm run test:api` で全体分岐 **約 76.3%**。**目標**: 全体 **80%**（あと約 **3.7pt**、概ね **+110〜115 分岐** が目安。分母は全体分岐数 ≈3092）。

## 方針

1. **影響の大きいファイルから順に**テストを追加する（`coverage/coverage-summary.json` の `branches.pct` が低く、`branches.total` が大きい順）。
2. **API 経由**で足りるものは `supertest`、**純粋ロジック・サービス**はユニットテストで埋める。
3. 閾値は **分岐が安定して 80% を超えた後**に `jest.config.js` の `coverageThreshold.global.branches` を **80** に更新する。

## 優先ファイル（第1波）

| 優先度 | ファイル | 狙い |
|--------|----------|------|
| 高 | `routes/admin/ordersRoutes.js` | `GET /api/admin/orders`、`POST /api/admin/orders-list-export`（csv/xlsx/バリデーション/500）、`POST /api/import-flam` |
| 高 | `routes/admin/pricesRoutes.js` | `customer-price-list` の catch、`download-pricelist-*` の失敗経路、Excel 取込の分岐 |
| 高 | `routes/orders-api.js` | `orderMatchesDownloadCsvKeyword`（`(顧客ID)` / `(商品コード)` / 部分一致）を `GET /api/download-csv` で網羅 |
| 中 | `services/mailService.js` | サポート通知の category・添付ファイル分岐など |
| 中 | `services/authAuditLogService.js` | ログ読込の catch（ENOENT 以外）・書込み失敗 |

## 第3波（残り約 5.7pt → 80% に向けて）

優先度の高い未充足分岐の多いファイル（`coverage/lcov-report` 参照）:

- `routes/orders-api.js` … 管理系 CSV・出荷インポートの残り catch / 境界。
- `routes/products/catalogRoutes.js` … `/products` のページング・`/cart-details` の null 行・`/download-my-pricelist` の finalPrice===0 除外など。
- `services/priceService.js` / `services/productService.js` … 既存の `*-coverage.unit.test.js` を拡張。
- `services/mailService.js` … 添付・カテゴリ以外の分岐。

## 完了条件

- `npm run test:api` で **All files の Branch ≥ 80%**（複数回実行でブレが小さいこと）。
- `jest.config.js` の `coverageThreshold.global.branches` を **80** に更新。
- 既存の `test:all` が引き続き通ること。

## 実施済み（第1〜2波）

- **API**: `branch-coverage-admin-orders-prices.api.test.js`（`GET /api/admin/orders`、orders-list-export csv/xlsx/エラー、import-flam、prices ルートの catch 等）、`orders-download-csv-keyword-branches.api.test.js`（`orderMatchesDownloadCsvKeyword` の `(顧客ID)` / `(商品コード)` 等）。
- **ユニット**: `price-manufacturer-normalize`、`ManualAdapter`、`validate` の Zod 以外例外、`excelReader` の sheetName / Date セル、`mailService` 追加分岐、`authAuditLogService` 破損 JSON、`passwordResetRequestService`、`orderService.searchOrders` の補完・逆引き・価格0救済。

## 進捗メモ

| 日付 | 内容 |
|------|------|
| 2026-04-01 | 計画策定・上記テスト追加。`jest.config.js` の global 分岐閾値を **73** に更新（実測に追随）。 |
| 2026-04-01 | `product-service-excel-rank-columns` の PK バッファ修正、`auth-audit-log` の EACCES/書込失敗、`catalog` / `admin-prices` 拡張、`price-service-branches`（Excel 取込・saveRankPrices・価格表 CSV/Excel）、`settings-service-extra-branches`、`orders-api-import-catch`、`stocks-routes-import-success` を追加。実測 **約 75.9%**。閾値 **75**。 |
| 2026-04-01 | 第4波: `csv-service-parse-estimates-extended`、`product-service-csv-import`、`excel-reader` 拡張、`customer-service-load-error`、`product-service-delete-not-found`、`csv-adapter-normalize-extended` を追加。実測 **約 76.0%**。閾値 **76**。 |
| 2026-04-01 | 第5波: `support-api-attachments-branches`（10MB超・非許可拡張子・添付DL 404/500）、`catalog-routes-unauth`（401 一括）、`mail-service-send-paths`（管理者通知先なしで `sendLoginFailureAlert` false）。`support-api` 分岐〜77%、`catalogRoutes` 〜79%、全体 **〜76.3%**。 |

## +4pt 向上計画（第4波・中間目標）

**狙い**: 一度に **+4 ポイント**（例: 76%→80%）に近づけるには、全体分岐でおおよそ **+120 前後**のカバーが必要。効率よく伸ばすには **分岐総数が大きく・率が低いファイル**を束ねて埋める。

| 優先 | ファイル | 内容 |
|------|----------|------|
| 高 | `routes/products/catalogRoutes.js` | 分岐約108・率〜77%未満。401/500・`estimate`・`frequent`・`download` の残り |
| 高 | `services/mailService.js` | 分岐約125・率〜67%。`sendInviteEmail` 分岐・`sendLoginFailureAlert` など |
| 高 | `routes/support-api.js` | 添付保存 `file.data` / `mv`、大容量エラー、`my-tickets` 例外経路 |
| 中 | `routes/auth/adminSessionRoutes.js` | ログイン・セッション周りの残分岐 |
| 中 | `services/productService.js` | CSV 取込以外（`deleteProduct`・空ファイル等） |
| 中 | `routes/admin/settingsRoutes.js` | `cartShippingNotice`・`getAnnouncements` 分岐・`/admin/account` 例外 |

### 第4波で実装済み（テスト追加）

- `tests/a-rank/csv-service-parse-estimates-extended.unit.test.js` … `parseEstimatesData`（CSV/UTF-8 BOM/別名列/Excel PK/失敗/必須列不足）、`parseExternalOrdersCsv`（英語ヘッダ・明細ゼロ除外）
- `tests/a-rank/product-service-csv-import.unit.test.js` … `importFromExcel` の **CSV（非 PK）** 経路
- `tests/a-rank/excel-reader.unit.test.js` … `sheetName` 不存在フォールバック、`readToObjects` + `sheetName`
- `tests/a-rank/customer-service-load-error.unit.test.js` … `_loadAll` 破損 JSON
- `tests/a-rank/product-service-delete-not-found.unit.test.js` … `deleteProduct` 未存在
- `tests/a-rank/csv-adapter-normalize-extended.unit.test.js` … `CsvAdapter.normalize`（Excel 行・CSV 倉庫マージ）

## 次の一手（80% まで）

- 分岐がまだ低い **`mailService.js`** / **`customerService.js`（import 行の残り）** / **`support-api.js`** / **`stocksRoutes.js`（parse-excel 等）** / **`adminSessionRoutes.js`** を `lcov` の未カバー行から優先。
- **`catalogRoutes.js`** を API テストでさらに厚くする（分岐密度が高い）。
- **`csvService.js`** は第4波で一部追加済み。残りは `parseExternalOrdersCsv` の列フォールバックや `parseEstimatesData` の日付セル分岐など。

## 82% 目標（第6波・2026-04-01）

**実測**: `npm run test:api` で全体分岐 **約 76.9%**（分母 ≈3092 のとき 82% まであと **約 +5.1pt**、概ね **+155〜160 分岐**）。

| 追加テスト（本セッション） | 狙い |
|---------------------------|------|
| `catalog-rank-catch-branches.api.test.js` | `rank_prices.json` 欠落時の `.catch()`（`/cart-details`・`/frequent`・`/download-my-pricelist`） |
| `stocks-routes-branch-coverage-82.api.test.js` | `parse-excel` 失敗500、`PUT adapters` 非配列、`manual-adjust` 分岐、`manual-release` 500 |
| `admin-api-coverage.api.test.js` 拡張 | `GET /admin/account` 空配列・ENOENT・EACCES |
| `settings-routes-public-catch.api.test.js` | `GET /settings/public` の catch |
| `product-service-getall-load-error.unit.test.js` | `getAllProducts` 読込失敗 |
| `mail-service-send-paths` | `sendInviteEmail` の EAUTH 以外エラー（汎用メッセージ） |
| `price-service-branches` | `getRankPricesUpdatedAt` ENOENT、`getPricelistCsvForRank` stripToken・純正メーカー順 |
| `csv-service-parse-estimates-extended` | `parseShippingCsv`・`parseExternalOrdersCsv` 日本語ヘッダ・単価NaN・有効期限文字列 |
| `order-service-external-flam-extra` | `importExternalOrders` 非配列、`importFlamData` 無効正規表現フォールバック |
| `password-reset-request-service` | レート制限・顧客メール失敗時トークン削除・管理者 `supportNotifyTo` フォールバック |
| `customer-service-import-new-row` | Excel 取込の**新規顧客**行（`else` ブロック） |
| `settings-service-update-merge` | `announcements` / `shippingRules` / `cartShippingNotice` マージ |

**82% 到達の次ラウンド（優先）**: `services/priceService.js`（分岐300超・`getPricelistExcelForRank` のシート重複・送料行）、`services/csvService.js`（残り `importFlamData` / `generateOrdersCsv` の未充足分岐）、`routes/orders-api.js`、`routes/auth/adminSessionRoutes.js`（reCAPTCHA・平文パスワード更新）、`routes/admin/pricesRoutes.js`（分岐25のうち未取得が多い）。閾値は **82% 安定後**に `jest.config.js` を更新する。

進捗追記: **継続作業（2026-04-01）** — `importFlamData`（空行・受注番号空・`cellToDateString` 成功）、`parseEstimatesData`（override 非配列）、`catalog` の `/products/frequent`（同一商品の `lastOrdered`・コードなし明細・`products.json` 破損時 500）、`productService`（定価 OPEN・`#NAME?` で名前更新スキップ）、`getPricelistExcelForRank`（送料規定の複数行）。`npm run test:api` の表示分岐は **約 77%** 前後だが、Jest の閾値判定は **76.92%** など内部値で行われるため **77** にすると環境・実行順で失敗しうる。**global 分岐閾値は 76 のまま**（安定して 77% 超が続くまで引き上げない）。
