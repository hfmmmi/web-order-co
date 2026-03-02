# 分岐 70% 到達のための追加テスト案

**目的**: Phase 1 完了条件「全体分岐 70% 以上・閾値 80/70」に向け、未カバー分岐を潰すテスト案をまとめる。  
**現状**: 行 86% 前後・分岐 67.85〜68.93%（ばらつきあり）。あと約 1〜2% の分岐カバーで 70% 到達を狙う。

---

## 1. 優先度：高（分岐寄与が大きい・安定して叩きやすい）

### 1.1 auth-api

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `appendAdminAuthLog` / `appendCustomerAuthLog` の write 失敗 | ログ書き込みが reject してもログイン成功のまま | 管理者/顧客ログイン成功後に `fs.promises.writeFile` を spy して reject させ、レスポンスは 200 のままであることを検証。**注意**: 既存で「監査ログ write 失敗」テストがある場合は重複避ける。 |
| `session.save` 失敗（Session Save Error） | 顧客/管理者ログイン時の `req.session.save(cb)` で err が返る | `express-session` の store / session.save をモックしてエラー経路を通す。**注意**: セッション保存失敗は統合テストでは flaky になりやすいため、モックで err コールバックを呼ぶ形に限定。 |
| `loadProxyRequests` 失敗（proxy-request GET） | readFile 失敗で `return {}` → pending: false | 既存「GET /api/account/proxy-request で loadProxyRequests 失敗時 pending:false」があればスキップ。なければ `fs.promises.readFile` をモックして reject。 |
| 招待トークン読込失敗（invite-reset） | tokens 読込 catch で `tokens = {}` | POST /api/invite-reset で invite_tokens.json を破損させ、申請がない状態で 200 系になることを検証。 |

### 1.2 admin-api

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `getCustomerPriceList` 失敗時 `res.json([])` | customer-price-list の catch で空配列返却 | `priceService.getCustomerPriceList` をモックして reject。レスポンス 200 かつ body が `[]` であることを検証。（既存でモックしている場合は要確認） |
| `getAllSpecialPrices` 失敗時 500 | special-prices-list の catch で 500 | `priceService.getAllSpecialPrices` をモックして reject。500 とメッセージを検証。 |
| 在庫系 catch | getStocks / getDisplaySettings / manual-adjust 等の catch で 500 | 該当 API でサービスをモックして reject し、500 が返ることを検証。**注意**: getStockContext を products から叩くテストは過去 flaky のため、admin の GET /admin/stocks 等に限定する方が安全。 |
| `download-pricelist-by-rank` 失敗時 500 | getPricelistCsvForRank が reject | `priceService.getPricelistCsvForRank` をモックして reject。500 と「価格表の生成に失敗」を検証。 |

### 1.3 orders-api / orderService

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `updateOrderStatus` キャンセル時の `stockService.release` 失敗 | orderService 内 catch(releaseError) でログのみ・注文は更新成功 | キャンセル可能な注文を用意し、`stockService.release` をモックして reject。update-order-status は 200 で、order の status はキャンセルに更新されていることを検証。 |

---

## 2. 優先度：中（分岐は増えるが実装コストや flaky リスクあり）

### 2.1 products-api

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `getStockContext` 失敗時 500（GET /products） | getAllStocks または getDisplaySettings が reject | **注意**: 過去に getStockContext をモックするテストは「他テストに影響」「200 が返る」等で flaky になったため削除されている。再挑戦する場合は、**products-api を require した直後に stockService をモック**するなど、影響範囲を最小限にした上で 500 経路のみを検証。 |
| `buildStockInfo` の境界 | `stock.warehouses` 非配列・`lastSyncedAt` 不正・`isStale` | 既に coverage-auth-orders-admin で「warehouses 非配列」「lastSyncedAt 不正/古い」を追加済みの可能性あり。未実装なら stocks.json を一時的に編集して GET /products で通す。 |

### 2.2 support-api

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `request-support` の writeFile 失敗時 500 | support_tickets.json 書き込みが reject | `fs.promises.writeFile` をモックして reject。POST が 500 を返すことを検証。 |
| `admin/update-ticket` の read 失敗時 | support_tickets 読込失敗で 500 | 既存で破損時 500 テストがあればスキップ。なければ readFile をモックして reject。 |

### 2.3 stockAdapters（services）

| 対象 | 内容 | テスト案 |
|------|------|----------|
| `createAdapter` 未知 type → null | type が csv/rest/manual 以外のとき null | ユニットで `createAdapter({ type: "unknown" })` が null を返すことを検証。 |
| `createAdapter` type 省略 → manual | config.type 省略時は manual | `createAdapter({})` が ManualAdapter のインスタンスであることを検証。 |

---

## 3. 優先度：低（余力時・分岐寄与は小さい）

### 3.1 auth-api 細かい分岐

- `request-password-reset` の reset_rate_limit 読込失敗（catch で rateData = {}）
- `setup` の invite_tokens / reset_tokens 読込失敗（catch で tokens = {}）
- ログイン失敗時の `appendCustomerAuthLog` / `appendAdminAuthLog` の .catch(() => {})（ログ失敗でもレスポンスは同じ）

これらは「読込失敗でデフォルト値」や「ログ失敗を握りつぶす」分岐で、既存テストで間接的に通っている可能性がある。カバレッジ計測で未カバーと出た場合に追加。

### 3.2 kaitori-api / その他 routes

- kaitori の各 catch（申請一覧読込失敗で `requests = []`、更新失敗で 500 等）は、既存の kaitori-api.api.test.js でエラー経路を増やすと分岐が伸びる。
- orders-api の CSV インポート・出荷インポートの内側 catch（行単位の try/catch）は、不正データでエラー経路を通すテストでカバー可能。

---

## 4. 実施時の進め方

1. **計測**: `npm run test:api` で現状の分岐率を確認（複数回実行してばらつきを確認）。
2. **優先度高から実施**: §1 のテストを coverage-auth-orders-admin.api.test.js または既存の A/B ランクテストに追加。モックは「そのテスト内でだけ有効」「finally で restore」を徹底し、他スイートに影響させない。
3. **再計測**: 追加後に `npm run test:api` で分岐が 70% を超えるか確認。安定して超えたら `jest.config.js` の `coverageThreshold.global` を `{ lines: 80, branches: 70 }` に更新。
4. **test:all 確認**: `npm run test:all` で API → E2E → 負荷 → flake まで全通過することを確認。

---

## 5. 既に実施済み・スキップ推奨

- place-order の汎用エラー（非 STOCK_SHORTAGE）: coverage-auth-orders-admin で追加済み。
- GET /admin/support-tickets の support_tickets 破損時空配列: 破損ファイルで検証済み。
- products-api の stock.warehouses 非配列・lastSyncedAt 不正/古い: 追加済みの可能性あり。
- proxy-request-status の loadProxyRequests 失敗時 status none: 追加済みの可能性あり。
- send-invite-email の mailResult.success:false・メール未登録: 追加済み。
- proxy-login の許可期限切れ・顧客不在: 追加済み。

上記はテスト一覧やカバレッジ差分で確認し、重複しないようにする。

---

## 6. まとめ

- **まず §1（優先度高）** の auth-api / admin-api / orderService の数本を追加し、分岐が 70% に届くか確認するのが効率的。
- **flaky を避ける**: モックはテストスコープ内に限定し、session や fs のモックは 1 テスト 1 経路に絞る。
- **閾値更新**: 分岐が安定して 70% 超えてから `jest.config.js` を 80/70 に変更する（docs/coverage-improvement-plan.md §12.7・test-plan-saas-ready.md §4.4 に従う）。

---

## 7. 実施記録（2026-02-20）

- **追加したテスト**（`tests/a-rank/coverage-auth-orders-admin.api.test.js`）:
  1. **GET /admin/download-pricelist-by-rank は getPricelistCsvForRank 失敗時500を返す** — admin-api の catch 分岐（価格表の生成に失敗）。
  2. **POST /api/admin/invite-reset は invite_tokens 読込失敗時も処理を継続して200で返す** — auth-api の invite_tokens 読込 catch（tokens = {}）経路。
  3. **GET /admin/stocks は getAllStocks 失敗時500を返す** — admin-api の在庫一覧取得 catch 分岐。
- **スキップした項目**: session.save 失敗（flaky リスク）、updateOrderStatus release 失敗（既存テストあり）、support-api・stockAdapters（既存でカバー済み）。
- **次のステップ**: `npm run test:api` で分岐率を確認し、安定して 70% を超えたら `jest.config.js` の global を 80/70 に更新。続けて `npm run test:all` で全ステップ通過を確認すること。
