# 分岐カバレッジ 90% — フェーズ7（エラー経路・例外・I/O 失敗）

分岐カバレッジが伸び悩むときの多くは **「成功パスは通ったが `catch`・権限エラー・破損データの分岐が薄い」** 場合である。ここでは **意図的に失敗を注入**して赤い分岐を埋める。

## 原則

1. **本番データを触らない** — `tests/setupJestDataDir.js` により、未設定時は `DATA_DIR` が `tests/_sandbox_data` になる。テストで読み書きする JSON は **原則この配下**（または `testSandbox` が用意するパス）。
2. **一時的な破壊は必ず戻す** — サンドボックス内ファイルを意図的に壊す場合も、`try` / `finally` で **元の内容に復元**する（`customer-service-load-error.unit.test.js` のパターン）。
3. **`ENOENT` 以外** — 多くのコードは「ファイルが無い」と「読めない・書けない」を分ける。`EACCES`・**破損 JSON**・**書込み失敗**は `jest.mock("fs")` や **一時ディレクトリの権限操作**（環境依存になりやすいのでモック優先）で狙う。
4. **HTTP の 500** — サービス層が投げた例外をルートの `catch` が返す経路は、**API テスト**でモックを仕込んで再現する（`support-api-update-ticket-500.api.test.js` など）。

## 失敗パターン早見表

| パターン | 狙い | テスト手法の例 |
|----------|------|----------------|
| ファイル不存在 | `ENOENT` 分岐 | サンドボックス上のパスを消す、または存在しないパスを渡す |
| 権限・開けない | `EACCES` 等 | `fs.promises` をモック |
| JSON 破損 | `JSON.parse` 失敗 → catch / 空扱い | 一時的に `{not-json` を書き込む |
| 書込み失敗 | ログ・トークン保存の catch | `fs.writeFile` をモックで reject |
| 外部 I/O（メール・HTTPS） | `sendMail` 失敗・reCAPTCHA 応答異常 | `jest.mock` または既存の失敗系 API テスト |
| 業務エラー vs 500 | `res.status(4xx)` と `next(err)` の分岐 | `supertest` でステータスを assert |

## 既存テストの参照（抜粋）

| 狙い | ファイル例（`tests/`） |
|------|-------------------------|
| JSON 破損・復旧 | `a-rank/json-corruption-recovery.api.test.js`, `s-rank/auth-audit-log-corruption.api.test.js` |
| 顧客・設定の読込失敗 | `a-rank/customer-service-load-error.unit.test.js`, `a-rank/product-service-getall-load-error.unit.test.js` |
| 公開設定の catch | `a-rank/settings-routes-public-catch.api.test.js` |
| カタログ・ランク価格の `.catch()` | `a-rank/catalog-rank-catch-branches.api.test.js` |
| 受注・インポートの catch | `a-rank/orders-api-import-catch.api.test.js` |
| サポート・注文の catch | `a-rank/branch-coverage-92-orders-support-catch.api.test.js`, `a-rank/support-api-update-ticket-500.api.test.js` |
| 監査ログの分岐 | `a-rank/auth-audit-log-service-branches.unit.test.js` |
| メール送信失敗 | `a-rank/mail-service-send-paths.unit.test.js`, `password-reset-request-service.unit.test.js` |

新規追加時は **ファイル名に `catch` / `error` / `corruption` / `500` など**が付くと検索しやすい。

## ワークフロー（フェーズ7の1サイクル）

1. `npm run coverage:baseline` → `lcov-report` で **赤い `catch` ブロック**または **エラー分岐の行**を特定する。
2. そのコードが **読み込みか・書き込みか・外部 API か**を分類する。
3. **サンドボックス + 復元**で足りるか、**モック**が必要か決める。
4. テストを追加し、**期待する HTTP ステータスまたは戻り値**を明示する（「何かしら失敗」ではなく、**どの分岐か**が分かるようにする）。

## フェーズ7の完了条件（このリポジトリでの定義）

1. 本ドキュメントの **原則と失敗パターン表**だけで、エラー系テストの追加方針が再現できること。
2. 新規テストが **`DATA_DIR` 外の本番用パス**を意図的に壊さないこと。
3. モックを使う場合、**他のテストに副作用が残らない**（`afterEach` でリストア / `jest.resetModules()` 等）。

数値目標（全体分岐 90%）は **フェーズ1** に従う。

---

## 関連ドキュメント

- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ2: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ3: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ4: `docs/branch-coverage-90-phase4-services.md`
- フェーズ5: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ6: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ8（閾値・フレーク）: `docs/branch-coverage-90-phase8-ci-threshold-flake.md`
- フェーズ9〜10・全体目次: `docs/branch-coverage-90-index.md`
- フレーク: `docs/flake-log.md`
