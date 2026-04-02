# 分岐カバレッジ 90% — フェーズ5（ミドルウェア・認証・セッションの横断分岐）

**対象の考え方**: `server.js` で **アプリ全体に先にかかる処理**（CORS・セッション・スライドタイムアウト・Helmet・レスポンス時間）と、**認証・レート制限・reCAPTCHA**（`routes/auth/*`）は、ルート単体のテストだけでは通りにくい分岐が多い。ここを **環境変数・Cookie・ヘッダ・POST ボディ**で切り替えて埋める。

## カバレッジ対象（`jest.config.js`）

- **`middlewares/**/*.js`** はすべて `collectCoverageFrom` に含まれる。
- **`routes/auth/`** 配下は `routes/**/*.js` に含まれる（`loginRateLimit.js` / `recaptcha.js` / `sanitizeAdminName.js` など）。
- **管理 API のガード** `routes/admin/requireAdmin.js` も `routes` 配下。分岐は単純だが、**未ログインで 401** を取るテストは各 `*-coverage*.api.test.js` に分散しやすい。

## ミドルウェア一覧とテストの向き

| ファイル | 役割 | テストの向き |
|----------|------|----------------|
| `middlewares/validate.js` | Zod による body/query/params 検証 | **ミニ Express アプリ + supertest**（`validate-middleware.api.test.js`）または **ユニット**（`validate-format-zod.unit.test.js`）。`jest.config.js` で **個別閾値**あり。 |
| `middlewares/sessionMiddleware.js` | セッション設定・ファイルストア | **ユニット**で `createSessionMiddleware` を `NODE_ENV` / `PERSIST_SESSION` / `SESSION_PATH` 等を変えて生成（`session-middleware.unit.test.js`）。 |
| `middlewares/slidingSessionTimeout.js` | セッション延長 | **API テスト**でセッション付きリクエスト（`tests/s-rank/session-timeout.api.test.js` 等）。 |
| `middlewares/corsAllowlist.js` | CORS 許可リスト | **API テスト**で `Origin` ヘッダと `ALLOWED_ORIGINS`（`cors-configuration.api.test.js`）。 |
| `middlewares/helmetIfAvailable.js` | Helmet / CSP | **API テスト**（`csp-headers.api.test.js`）。 |
| `middlewares/responseTime.js` | 応答時間ヘッダ | 必要なら `X-Response-Time` を assert する API テスト。 |

## `routes/auth/` 一覧とテストの向き

| ファイル | 内容 | 既存テストの例 |
|----------|------|----------------|
| `customerSessionRoutes.js` | 顧客ログイン・セッション・アカウント | `auth-api-coverage.api.test.js`, `coverage-auth-orders-admin.api.test.js` |
| `adminSessionRoutes.js` | 管理者ログイン・チェック | 上記、`branch-coverage-90-admin-plain-password.api.test.js` |
| `loginRateLimit.js` | ログイン試行制限 | `session-fixation-and-rate-limit-boundary.api.test.js`, `auth-security.api.test.js` |
| `recaptcha.js` | reCAPTCHA 検証 | `recaptcha-verify-failure.api.test.js`, `auth-api-captcha-verify-failure.api.test.js`, `captcha-required-response.api.test.js` |
| `sanitizeAdminName.js` | 管理者名サニタイズ | `sanitize-admin-name.api.test.js` |

## 環境変数・ヘッダのチェックリスト（分岐を切るとき）

テストや `beforeAll` で一時変更する場合は、**必ず `afterEach` / `afterAll` で元に戻す**（`session-middleware.unit.test.js` のパターン）。

| 変数・入力 | 影響しやすい箇所 |
|------------|------------------|
| `NODE_ENV`, `SESSION_SECRET`, `PERSIST_SESSION`, `SESSION_PATH` | `sessionMiddleware` |
| `ALLOWED_ORIGINS`（カンマ区切り） | `corsAllowlist` |
| `TRUST_PROXY` | `server.js` の `trust proxy` |
| reCAPTCHA 関連・サイトキー未設定 | `recaptcha`・ログイン系 |
| `Cookie` / セッション付き `supertest` | 認証済み経路 |

## ワークフロー（フェーズ5の1サイクル）

1. `npm run coverage:baseline` → `npm run coverage:gap-report` で **`middlewares/` または `routes/auth/`** が上位か確認。
2. `coverage/lcov-report` で **該当ファイルの未カバー分岐**を確認。
3. **ミドルウェア単体**なら小さな `express()` アプリに1つだけ `use` して `supertest`、**環境依存**なら `jest.resetModules()` のうえ `require` し直す（`session-middleware.unit.test.js`）。
4. **認証フロー**は `request(app).post("/api/...").set("Cookie", ...)` や、既存の `seedBaseData` + ログイン補助ヘルパがあればそれに合わせる。

## フェーズ5の完了条件（このリポジトリでの定義）

1. 本ドキュメントの **ミドルウェア／auth の対応表**と手順だけで、新規担当者が「どこを見るか」を再現できること。
2. `validate.js` の閾値（`jest.config.js` の `middlewares/validate.js`）を満たす方針が、**API テストとユニット**の組み合わせで説明できること。
3. 環境変数を変えるテストが **他ファイルに副作用を残さない**こと。

数値目標（全体分岐 90%）は **フェーズ1** に従う。

---

## 関連ドキュメント

- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ2: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ3（ルート・API）: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ4（サービス・ユニット）: `docs/branch-coverage-90-phase4-services.md`
- フェーズ6（ストック・CSV・Excel・アダプタ）: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8〜10・全体目次: `docs/branch-coverage-90-index.md`
- フレーク: `docs/flake-log.md`
