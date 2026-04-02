# 分岐カバレッジ 90% — フェーズ4（サービス層のユニットテスト）

API 1 リクエストでは通らない **内部の `if` の組み合わせ**（Excel 列フォールバック、CSV ヘッダ差異、NaN・空配列、正規表現フォールバックなど）は、**サービスを直接 `require` し、I/O をモックまたはサンドボックス上のファイルで操作**するユニットテストが効率がよい。

## フェーズ3（ルート）との役割分担

| 向き | 使うテスト | 例 |
|------|------------|-----|
| HTTP・認証・ミドルウェア・ステータスコード | **API テスト**（`supertest`） | `GET /api/admin/orders` が 401 |
| **純粋ロジック・分岐の密度** | **ユニット**（`*.unit.test.js`） | `parseEstimatesData` の別名列・BOM |
| 両方混在 | まずユニットで分岐を埋め、残りを API | `priceService` の Excel 経路 |

`npm run coverage:gap-report` で **`services/**/*.js` が上位**に出たら、フェーズ4を優先しやすい。

## カバレッジ対象（`jest.config.js` の `collectCoverageFrom`）

`services/**/*.js` はすべて分母に含まれる。次の表は **ファイルと既存ユニットテストの対応（抜粋）**。

| サービスファイル | 既存テストの例（`tests/a-rank/`） |
|------------------|-------------------------------------|
| `services/priceService.js` | `price-service-branches.unit.test.js`, `price-service-coverage.unit.test.js`, `price-service-excel-*.unit.test.js` |
| `services/csvService.js` | `csv-service-coverage.unit.test.js`, `csv-service-parse-estimates-extended.unit.test.js` |
| `services/productService.js` | `product-service-coverage.unit.test.js`, `product-service-csv-import.unit.test.js`, `product-service-import-branches.unit.test.js` |
| `services/orderService.js` | `order-service-search-orders.unit.test.js`, `order-service-external-flam-extra.unit.test.js`, `order-service-cancel-release.unit.test.js` |
| `services/customerService.js` | `customer-service-load-error.unit.test.js`, `customer-service-extra-branches.unit.test.js`, `customer-service-import-new-row.unit.test.js` |
| `services/settingsService.js` | `settings-service-extra-branches.unit.test.js`, `settings-service-update-merge.unit.test.js` |
| `services/mailService.js` | `mail-service-send-paths.unit.test.js`, `login-failure-alert-template.unit.test.js` |
| `services/authAuditLogService.js` | `auth-audit-log-service.unit.test.js`, `auth-audit-log-service-branches.unit.test.js` |
| `services/passwordResetRequestService.js` | `password-reset-request-service.unit.test.js` |
| `services/specialPriceService.js` | `special-price-service.unit.test.js` |
| `services/priceManufacturerNormalize.js` | `price-manufacturer-normalize.unit.test.js` |
| `services/csv/orderCsvExport.js` | `order-csv-export.unit.test.js`, `branch-coverage-90-order-csv-export.unit.test.js` |
| `services/stockAdapters/*.js` | `csv-adapter-normalize-extended.unit.test.js`, `stock-manual-adapter.unit.test.js`, `rest-adapter.unit.test.js`, `stock-adapters-boundaries.unit.test.js` |
| `services/authTokenStore.js` | （専用テストは未整備。**ギャップ候補**） |

`services/stockService.js` は API 連携や `stockAdapters` 経由が多い。`branch-coverage-90-stock-sync.unit.test.js` などを参照。

## 実装パターン（既存コードに合わせる）

1. **`"use strict"`** と **`describe` / `test`** の構成は既存 `*.unit.test.js` に揃える。
2. **`tests/setupJestDataDir.js`** により `DATA_DIR` がテスト用。ファイルを書き換えるテストは **読み書き前にバックアップ**するか、専用の一時ファイルパスを使う（`customer-service-load-error.unit.test.js` の `finally` 復元パターン）。
3. **外部依存のモック**: メール・一部モジュールは `jest.mock("../../services/mailService", ...)` のように **API テストと同型**でよい。`fs` をモックする場合は **他テストと干渉しない**よう `afterEach` で `jest.resetModules()` やモック解除を検討する。
4. **ファイル名**: `tests/a-rank/<機能>-<狙い>.unit.test.js`（例: `csv-service-parse-estimates-extended.unit.test.js`）。
5. **実行**: 単体なら `npx jest tests/a-rank/<file>.unit.test.js --runInBand`、まとめて `npm run test:a`。

## テスト設計テンプレート（コピー用）

```
対象: services/__________.js
関数またはシナリオ: __________

| # | 入力・前提 | 期待（戻り値・副作用） | 狙う分岐 |
|---|------------|------------------------|----------|
| 1 | | | |
```

## ワークフロー（フェーズ4の1サイクル）

1. `npm run coverage:baseline` → `npm run coverage:gap-report`（必要なら `--min-branch-total 20` で上位を絞る）。
2. 対象が **`services/`** なら `lcov-report` で **該当ファイルの赤い分岐**を確認。
3. 上記テンプレにケースを列挙し、**ユニット**で追加（API だけで十分ならフェーズ3へ回す）。
4. `npm run test:a` または該当ファイルのみ Jest で通過を確認。

## フェーズ4の完了条件（このリポジトリでの定義）

次を満たしたら、フェーズ4の「型」は完了とみなす。

1. **サービス層の進め方**が本ドキュメントとフェーズ2の手順だけで再現できること。
2. **ユニットと API の使い分け**が上表の基準で説明できること。
3. 新規ユニットテストが **`DATA_DIR` サンドボックス**を破壊しないこと（本番 `settings.json` 等を触らない）。

数値目標（全体分岐 90%）は **フェーズ1** の定義に従い、フェーズ4では **密度の高い分岐の取り方**を固定する。

---

## 関連ドキュメント

- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ2: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ3: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ5（ミドルウェア・認証・セッション）: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ6（ストック・CSV・Excel・アダプタ）: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8〜10・全体目次: `docs/branch-coverage-90-index.md`
- 従来の 80% 計画: `docs/branch-coverage-80-plan.md`
