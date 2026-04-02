# 分岐カバレッジ 90% — フェーズ6（ストック・CSV・アダプタ・Excel 周辺）

**対象の考え方**: 価格・在庫・受注まわりは **ファイル形式の差**（CSV / Excel・シート名・列名・BOM・空行）と **アダプタ種別**（manual / csv / rest）で分岐が密集しやすい。同じロジックに対して **入力だけ変えるデータ駆動テスト**が効く。

## カバレッジ対象（`jest.config.js` の `collectCoverageFrom`）

| 領域 | パス例 |
|------|--------|
| ユーティリティ（直接対象） | `utils/excelReader.js`, `utils/rankPriceImportBuffer.js`, `utils/priceCalc.js` |
| サービス | `services/csvService.js`, `services/csv/orderCsvExport.js`, `services/stockService.js`, `services/stockAdapters/**/*.js`, `services/priceService.js`, `services/productService.js` など |
| ルート（HTTP 経由） | `routes/admin/stocksRoutes.js`, `routes/admin/pricesRoutes.js`, `routes/orders-api.js`（CSV 系）など |

`services/**/*.js` と `utils` の3ファイルが分母に入るため、**ユニットと API の両方**から同じ関数を叩ける場合は、分岐の取りやすさで選ぶ（フェーズ3・4と同様）。

## コンポーネント早見表

| コンポーネント | 役割 | テストの向き |
|----------------|------|----------------|
| `utils/excelReader.js` | シート読み取り・セル型 | **ユニット** `excel-reader.unit.test.js` |
| `utils/rankPriceImportBuffer.js` | ランク価格取込バッファ | **ユニット** `rank-price-import-buffer.unit.test.js` |
| `services/csv/orderCsvExport.js` | 受注 CSV 出力 | **ユニット** `order-csv-export.unit.test.js`, `branch-coverage-90-order-csv-export.unit.test.js` |
| `services/stockAdapters/index.js` | `createAdapter(type)` | 不正 `type` で `null` 等 → **ユニット** |
| `services/stockAdapters/csvAdapter.js` | CSV 連携 | `branch-coverage-91-csv-adapter.unit.test.js`, `csv-adapter-normalize-extended.unit.test.js` |
| `services/stockAdapters/manualAdapter.js` | 手動 | `stock-manual-adapter.unit.test.js` |
| `services/stockAdapters/restAdapter.js` | REST | `rest-adapter.unit.test.js` |
| `services/stockAdapters/baseAdapter.js` | 基底 | `stock-adapters-boundaries.unit.test.js` |
| `services/stockService.js` | 在庫本体 | ユニット + API（`stocks-routes-*.api.test.js`, `branch-coverage-90-stock-sync.unit.test.js`） |
| `routes/admin/stocksRoutes.js` | 管理 API（import・manual・parse-excel） | **API** `stocks-routes-branch-coverage-82.api.test.js` 等 |

## 既存テストの参照（抜粋）

| 狙い | ファイル例（`tests/a-rank/` ほか） |
|------|--------------------------------------|
| Excel 読取・列 | `excel-reader.unit.test.js`, `branch-coverage-91-price-excel-columns.unit.test.js`, `product-service-excel-rank-columns.unit.test.js` |
| CSV / 見積・外部受注 | `csv-service-coverage.unit.test.js`, `csv-service-parse-estimates-extended.unit.test.js`, `csv-adapter-normalize-extended.unit.test.js` |
| ランク価格バッファ | `rank-price-import-buffer.unit.test.js` |
| 受注 CSV エクスポート | `order-csv-export.unit.test.js`, `branch-coverage-90-order-csv-export.unit.test.js` |
| アダプタ境界 | `stock-adapters-boundaries.unit.test.js`, `branch-coverage-91-csv-adapter.unit.test.js` |
| 在庫ルート | `stocks-routes-branch-coverage-82.api.test.js`, `stocks-routes-import-success.api.test.js` |
| 価格取込 | `prices-import-routes.api.test.js`, `admin-prices-routes-branch.api.test.js` |
| 同期 | `branch-coverage-90-stock-sync.unit.test.js`, `tests/b-rank/stock-service-sync.api.test.js` |

## データ駆動テストのテンプレ（コピー用）

**入力の次元**を先に決める（ヘッダ言語・BOM・空行・シート名・列欠損・数値 NaN など）。`describe.each` / `test.each` で表をそのままコードにする。

```javascript
// 例: 入力オブジェクトまたはバッファを列挙し、期待する分岐だけを assert
describe.each([
  { label: "UTF-8 BOM 付き CSV", input: "...", expectRows: 2 },
  { label: "必須列欠損", input: "...", expectError: true }
])("$label", ({ input, expectRows, expectError }) => {
  // ...
});
```

## 注意（データとサンドボックス）

- **`tests/setupJestDataDir.js`** により `DATA_DIR` はテスト用。本番の JSON / アップロード先を触らない。
- **アップロード・import API** は `multipart` やバッファを `supertest` で送る。既存の `stocks-routes-*` / `prices-import-*` を真似る。
- **大きなバイナリ**は最小の xlsx/csv バイト列に留める（境界の再現に必要な分だけ）。

## ワークフロー（フェーズ6の1サイクル）

1. `npm run coverage:baseline` → `npm run coverage:gap-report`（必要なら `--min-branch-total 15`）で **`stockAdapters` / `csvService` / `excelReader` / `stocksRoutes`** が上位か確認。
2. `lcov-report` で **該当ファイルの赤い分岐**を確認。
3. **同じ関数の別入力**ならデータ駆動で追加。**HTTP 固有**ならフェーズ3の API テストに追加。
4. `npm run test:a` または該当ファイルのみ Jest で確認。

## フェーズ6の完了条件（このリポジトリでの定義）

1. 本ドキュメントの **コンポーネント早見表**と手順で、ストック・CSV・Excel 系の「どこを見るか」が再現できること。
2. 新規テストが **データ駆動**または **既存パターン**（`*.unit.test.js` / `*-routes*.api.test.js`）に沿っていること。
3. **サンドボックス外のファイル**をテストで破壊しないこと。

数値目標（全体分岐 90%）は **フェーズ1** に従う。

---

## 関連ドキュメント

- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ2: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ3: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ4: `docs/branch-coverage-90-phase4-services.md`
- フェーズ5: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8〜10・全体目次: `docs/branch-coverage-90-index.md`
- 従来の 80% 計画: `docs/branch-coverage-80-plan.md`
