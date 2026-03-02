# 引き継ぎメモ: 入力検証の統一（主要API）

## 実装済み（Phase 1 完了）
- **validators/requestSchemas.js**: 6API用のZodスキーマ（loginSchema, placeOrderSchema, addCustomerSchema, updateCustomerSchema, adminSettingsUpdateSchema）を定義。いずれも `.strict()` で unknown key 拒否。
- **middlewares/validate.js**: `validateBody(schema)` / `validateQuery(schema)` / `validateParams(schema)` を提供。400 時は `{ success: false, message: "入力内容に誤りがあります", errors: [{ path, message }] }` に統一。
- **適用済みルート**: `POST /api/login`, `POST /api/admin/login`, `POST /place-order`, `POST /api/add-customer`, `POST /api/update-customer`, `PUT /api/admin/settings`
- **検証**: `tests/s-rank/request-validation.api.test.js` で unknown key 拒否・型不正・エラーフォーマットを検証。

---

## 背景
- 現状、APIごとに `req.body` の手書きチェックが散在し、検証粒度が不統一。
- 主要APIでスキーマ検証（型/必須/長さ/形式）を共通化する。

## このスレッドでの意思決定
1. マルチテナント化: 現時点では実装しない（社内運用優先）
2. 顧客ごとの `orders/prices` ファイル分割: 現時点では不要（現行運用継続）
3. シークレット: 本番は `MAIL_PASSWORD` 管理、`settings.json` へ保存しない
4. 次優先: 入力検証の統一を主要APIから段階導入

## 実装スコープ（Phase 1）
- `POST /api/login`
- `POST /api/admin/login`
- `POST /place-order`
- `POST /api/add-customer`
- `POST /api/update-customer`
- `PUT /api/admin/settings`

## 実装方針
- ライブラリは1つに統一（推奨: zod）
- `middlewares/validate.js` を作成
  - `validateBody(schema)`
  - `validateQuery(schema)`（必要に応じて）
  - `validateParams(schema)`（必要に応じて）
- unknown key は拒否（strict）
- 400エラー形式を統一:
  - `{ success:false, message:"入力内容に誤りがあります", errors:[...] }`

## API別バリデーション要件（最低限）

### 1) `POST /api/login`, `POST /api/admin/login`
- `id`: string, trim後 1..100
- `pass`: string, 1..200
- `captchaToken`: optional string, max 4000

### 2) `POST /place-order`
- `cart`: array(min:1)
  - item: `{ code|string, quantity|number(int, min:1, max:9999) }`
- `deliveryInfo`: object
  - 主要フィールド文字列長制限（例: `name` 1..100, `tel` 1..30, `address` 1..300）
  - 任意項目も上限を設定

### 3) `POST /api/add-customer`, `POST /api/update-customer`
- `customerId`: string, 1..50, 許容文字制限
- `customerName`: string, 1..100
- `email`: optional email, max 254
- `priceRank`: optional enum（現行仕様に合わせる）

### 4) `PUT /api/admin/settings`
- `mail.smtp.host`: optional string, max 255
- `mail.smtp.port`: optional int, 1..65535
- `mail.smtp.secure`: optional boolean
- `mail.smtp.user`: optional string, max 255
- `features`: optional object(booleanのみ)
- `announcements`: optional array（`title`/`body` 長制限）
- `recaptcha.siteKey`/`recaptcha.secretKey`: optional string, 上限あり

## タスク分解
1. 依存追加（zod）
2. 共通ミドルウェア作成
3. 上記6APIへ適用
4. エラー応答整形
5. 手動テスト（正常/異常/境界）

## 受け入れ条件（DoD）※Phase 1 達成済み
- 不正型・必須欠落・過長入力で 400 が返る ✓
- 既存正常系フロー（ログイン・注文・顧客更新・設定保存）が維持される ✓
- ルート内の重複バリデーションロジックを最小化 ✓

## リスク
- 既存フロントが送っている余剰キーで 400 になる可能性
- strict化で互換性影響が出た場合、段階的にルート単位で適用

## 次スレッド開始時の依頼文テンプレ
`docs/handover-input-validation-plan.md` に沿って、Phase 1 の6APIに zod バリデーションを実装してください。既存挙動を壊さないよう、エラー形式は統一し、変更後に主要フローの確認結果を報告してください。
