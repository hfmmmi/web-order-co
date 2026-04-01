# テスト・カバレッジ計画（SaaS 外販レベル到達）

**策定日**: 2026-02-19  
**前提**: 現段階を **Phase 0** とし、月額課金で外販できる品質までテストを段階的に強化する。

---

## 1. Phase 0：現状の定義

### 1.1 定量的な現状（2026-02-19 時点）

| 項目 | 値 |
|------|-----|
| **テストスイート数** | 62（s-rank / a-rank / b-rank / risk-driven） |
| **テスト数** | 453〜454 |
| **行カバレッジ（全体）** | 約 87% |
| **分岐カバレッジ（全体）** | 約 71%（`test:api` 計測・2026-04-01） |
| **jest 閾値（global）** | lines: 85, branches: 70（分岐マイルストーン優先） |
| **P0 閾値** | auth-api 80/66、orders-api 90/62、admin-api 80/62、validate 90/70、priceCalc 99/99 |

### 1.2 テスト構成

- **API**: S/A/B/Risk ランク＋カバレッジ付き（`npm run test:api`）
- **E2E**: Playwright（`npm run test:e2e`）
- **負荷**: autocannon による代表 API（`npm run test:load`）
- **flake 監視**: 複数回実行で不安定検出（`npm run test:flake`）
- **一括**: `npm run test:all` で API → E2E → 負荷 → flake の順で実行

### 1.3 Phase 0 のギャップ（SaaS 外販に向けて不足している点）

| 観点 | 現状 | 外販レベルで欲しい水準 |
|------|------|------------------------|
| カバレッジ | 分岐 約71%、閾値 85/70 | 分岐 70% 以上を維持、次段で行閾値・P0 を計画どおり |
| 安定性 | test:all で一部 flaky の可能性 | 全実行で安定 PASS、flake 検出ゼロ |
| セキュリティ | 認証・認可・CORS/CSP 等のテストあり | 認可・監査・インジェクション境界の明示的カバー |
| 性能 | 負荷試験・p99 閾値あり | 基準の文書化・閾値の見直し |
| 契約・仕様 | 一部 API の境界テスト | 公開 API の契約・レスポンス形式の明文化 |
| リリースゲート | CI で test:all 実行 | 「外販リリース可能」判定チェックリスト |

---

## 2. SaaS 外販レベルの定義（ゴール）

**「SaaS として外販できるレベル」** を、テスト観点で次のように定義する。

### 2.1 品質ゲート

1. **カバレッジ**
   - 全体: 行 80% 以上・分岐 70% 以上
   - P0（auth / orders / admin / validate / priceCalc）: 行 80% 以上・分岐 70% 以上
   - `jest.config.js` の `coverageThreshold.global` を 80/70 に設定し、CI で維持

2. **テスト実行**
   - `npm run test:all` が常に PASS（API・E2E・負荷・flake）
   - flake 監視で不安定テストゼロ
   - CI の必須チェックとして test:all を採用

3. **セキュリティ・監査**
   - 認証・認可・レート制限・監査ログのテストが網羅されていること
   - 入力検証（Zod 等）の適用 API で境界・不正入力のテストあり

4. **性能**
   - 負荷試験の p99 閾値を満たすこと（現行 500ms 等）
   - 性能基準をドキュメント化し、劣化時に検知できること

5. **契約・API**
   - 顧客向け・管理向けの主要 API について、成功/エラー時のレスポンス形式がテストで保証されていること（境界・契約の明文化）

### 2.2 リリースゲート（外販リリース可能判定）

- 上記 2.1 を満たしていること
- 「外販リリースチェックリスト」（本計画 Phase 5 で作成）をクリアしていること
- 既知の重大不具合がゼロであること

---

## 3. Phase 構成（Phase 0 → 外販レベル）

| Phase | 狙い | 主な成果物 | 完了条件 |
|-------|------|------------|----------|
| **Phase 0** | 現状の固定 | （定義済み） | - |
| **Phase 1** | カバレッジ理想値到達 | 分岐 70%・閾値 80/70・test:all 安定 | global 80/70、test:all 全通過安定 |
| **Phase 2** | E2E・負荷・flake の基準化 | シナリオ一覧・負荷基準・flake 運用 | E2E 必須シナリオ定義、負荷閾値文書化、flake ゼロ |
| **Phase 3** | セキュリティ・監査の強化 | 認可・監査・入力境界のテスト追加 | 認可/監査/境界のテスト網羅、ドキュメント更新 |
| **Phase 4** | 契約・API 安定性の明文化 | 公開 API の契約テスト・仕様メモ | 主要 API の契約・境界がテストとドキュメントで明示 |
| **Phase 5** | 外販リリースゲート整備 | チェックリスト・リリース手順 | 外販リリースチェックリスト完成、test:all 必須化の確認 |

---

## 4. Phase 1：カバレッジ理想値到達

**目的**: 分岐 70% 達成と閾値 80/70 の設定。test:all の安定通過を前提とする。

### 4.1 タスク

1. **分岐カバレッジ 70% 到達**
   - カバレッジレポートで分岐が低いファイルを特定（admin-api・auth-api・products-api・stockAdapters 等）
   - 未カバー分岐（catch・条件分岐・境界）へのテスト追加
   - `npm run test:api` で全体 行 80% 以上・分岐 70% 以上を安定して確認

2. **閾値更新**
   - 安定して分岐 70% を超えたら、`jest.config.js` の `coverageThreshold.global` を `{ lines: 80, branches: 70 }` に更新
   - P0 ファイル（auth-api・admin-api）の閾値を 80/70 に設定（到達している場合）

3. **test:all 安定化**
   - test:api 全通過に加え、E2E・負荷・flake まで含めて全通過を確認
   - flaky が出る場合は beforeEach でのデータ初期化・モックの見直し

### 4.2 完了条件

- [x] **分岐カバレッジ 70% 以上**（2026-04-01 時点: `npm run test:api` で全体分岐 **約 71.3%**。行は約 91%）
- [x] **分岐閾値 70%** — `coverageThreshold.global.branches` を **70** に設定（行閾値 85 は据え置き。一気に 80/70 へ揃えない）
- [ ] 全体 行 80% 以上を閾値と計画どおり揃える（次段階）
- [ ] `npm run test:all` が全ステップ PASS（API・E2E・負荷・flake）

### 4.4 Phase 1 実施記録（2026-02-19）

- **追加テスト**（`tests/a-rank/coverage-auth-orders-admin.api.test.js`）  
  - auth-api: GET /api/account/proxy-request で adminName が空のとき「管理者」を返す（sanitizeAdminName フォールバック）  
  - auth-api: GET /api/account/settings で getCustomerById が null のとき 404  
  - auth-api: PUT /api/account/settings で updateCustomerAllowProxy が success:false のとき 400  
  - auth-api: 監査ログ（admin-auth / customer-auth）が破損 JSON でもログイン成功（read の ENOENT 以外 catch 分岐）  
  - admin-api: GET /api/settings/public で getAnnouncements が配列でないとき orderBanners/announcements を空配列で返す  
- **閾値**: 現状は global 80/67 を維持。**分岐が安定して 70% を超えたら** `jest.config.js` の `coverageThreshold.global` を `{ lines: 80, branches: 70 }`、auth-api・admin-api の branches を 70 に更新すること。  
- **次**: `npm run test:api` で分岐率を確認 → 70% 到達後は閾値 80/70 に更新 → `npm run test:all` で全通過を確認。

### 4.5 Phase 1 追加実装（分岐70%到達向け・2026-02-19）

- **追加テスト**（`tests/a-rank/coverage-auth-orders-admin.api.test.js`）  
  - products-api: GET /products で stock.warehouses が配列でない場合もエラーなく処理する（buildStockInfo 分岐）  
  - products-api: lastSyncedAt が不正な在庫でも isStale:false で返す（isNaN(synced) 分岐）  
  - products-api: highlightThresholdMinutes を超えた lastSyncedAt で isStale:true を返す  
  - orders-api: place-order で STOCK_SHORTAGE 以外のエラー時に「システムエラー」を返す（汎用 catch 分岐）  
  - support-api: GET /admin/support-tickets で support_tickets.json 破損時は空配列を返す  
- **閾値**: global 80/67 維持。分岐が安定して 70% 超え次第、`jest.config.js` の global を 80/70 に更新すること。

### 4.3 工数目安

2〜4 時間（追加テスト・閾値更新・test:all 確認）

---

## 5. Phase 2：E2E・負荷・flake の基準化

**目的**: 外販時に「どこまでを自動テストで保証するか」を明文化し、E2E・負荷・flake を定常品質として扱えるようにする。

### 5.1 タスク

1. **E2E 必須シナリオの定義**
   - 顧客: ログイン → 商品一覧 → カート → 注文確定 → 履歴確認
   - 管理: ログイン → 注文一覧・ステータス更新・設定保存・顧客管理・代理ログイン
   - 認証: ログイン失敗・ロック・CAPTCHA・パスワード再設定・招待
   - 上記を `docs/e2e-critical-scenarios.md` 等に一覧化し、欠けているシナリオを E2E で追加

2. **負荷試験の基準文書化**
   - 対象 API・p99 閾値・許容スループットを `docs/step3-performance-load-flake.md` または別ドキュメントに明記
   - 閾値超過時の対応方針（調査・閾値見直し）を記載

3. **flake 運用の確立**
   - `npm run test:flake` を週次または PR 前のオプションとして運用
   - 検出された不安定テストの修正を優先し、「flake ゼロ」を目標に記録

### 5.2 完了条件

- [ ] E2E 必須シナリオ一覧のドキュメントがあり、対応する spec が存在する
- [ ] 負荷試験の対象・閾値・運用がドキュメント化されている
- [ ] flake 監視を実行し、不安定テストがゼロまたは対策済みである

### 5.3 工数目安

3〜5 時間（シナリオ洗い出し・ドキュメント・不足 E2E 追加・flake 解消）

---

## 6. Phase 3：セキュリティ・監査の強化

**目的**: 外販時に説明責任を果たせるよう、認可・監査・入力境界のテストを明示的に整える。

### 6.1 タスク

1. **認可テストの網羅**
   - 未認証・顧客ログイン済みからの `/api/admin/*` アクセスが 401 であることを既存・追加テストで保証
   - 管理者のみの操作（設定更新・顧客一覧・代理ログイン等）が顧客セッションで拒否されることを確認

2. **監査ログのテスト**
   - 管理者・顧客の login / logout / failed_login が正しく記録されること
   - ログ形式・必須項目がテストで検証されていること（既存 s-rank をベースに不足を追加）

3. **入力境界・インジェクション対策の確認**
   - 入力検証（Zod）が適用されている API で、不正 body/query/params が 400 で弾かれることをテスト
   - XSS・SQL インジェクション等の境界が既存テストで触れられているかを確認し、不足なら追加

4. **CORS・CSP・Cookie のテスト**
   - 既存の CORS/CSP/Cookie テストを一覧化し、外販時の設定（ALLOWED_ORIGINS 等）を想定したケースがあるか確認

### 6.2 完了条件

- [ ] 管理 API 認可（未認証・顧客ログイン）のテストが明示的に存在する
- [ ] 監査ログの項目・順序がテストで検証されている
- [ ] 主要 API の不正入力が 400 で返るテストが揃っている
- [ ] セキュリティ関連のテスト一覧またはドキュメントがある（任意）

### 6.3 工数目安

2〜4 時間（既存の棚卸し＋不足分の追加・ドキュメント）

---

## 7. Phase 4：契約・API 安定性の明文化

**目的**: 外販後も「仕様どおり動く」ことをテストとドキュメントで示し、API の破壊的変更を防ぐ。

### 7.1 タスク

1. **公開 API の整理**
   - 顧客向け: `/api/login`、`/api/session`、`/products`、`/place-order`、`/order-history`、`/settings/public` 等
   - 管理向け: `/api/admin/login`、`/admin/settings`、`/admin/orders`、注文ステータス更新・出荷登録等
   - 上記の成功時レスポンス形式・エラー時（400/401/500）の形式を一覧化

2. **契約的なテストの追加**
   - 既存の境界テスト（success: true/false、message の有無、配列形式）を「契約」として扱い、不足しているレスポンス項目があればテストでカバー
   - 新規に「契約テスト」スイートを設けるか、既存 risk-driven / a-rank に「契約」コメントを付与するかは任意

3. **仕様メモの作成**
   - `docs/api-contract-overview.md` 等に、主要 API のリクエスト/レスポンスの要点と、テストで保証している範囲を簡潔に記載

### 7.2 完了条件

- [ ] 主要な顧客・管理 API の成功/エラー時の形式がテストで保証されている
- [ ] API の契約・境界を説明するドキュメントが存在する（概要レベルで可）

### 7.3 工数目安

3〜5 時間（API 一覧・既存テストの整理・ドキュメント）

---

## 8. Phase 5：外販リリースゲート整備

**目的**: 「外販してよい」と判断するためのチェックリストと、リリース前の手順を整える。

### 8.1 タスク

1. **外販リリースチェックリストの作成**
   - カバレッジ閾値達成（80/70）
   - test:all 全通過
   - セキュリティ・監査のテスト実施済み
   - 負荷試験閾値クリア
   - 環境変数・シークレット（SESSION_SECRET、MAIL_PASSWORD 等）の本番運用確認
   - 既知の重大不具合ゼロ
   - 上記を `docs/release-checklist-saas.md` 等にチェックリストとして記載

2. **リリース前手順の記載**
   - 本番デプロイ前に `npm run test:all` を実行すること
   - CI で main/master/develop への push 時に test:all が走ることの確認
   - ブランチ保護で「test:all 通過を必須にする」設定を推奨する旨を記載（`docs/ci-setup.md` と整合）

3. **Phase 1〜4 の完了確認**
   - 各 Phase の完了条件をチェックリストに反映し、外販前に Phase 1〜5 がすべて完了していることを要求

### 8.2 完了条件

- [ ] `docs/release-checklist-saas.md`（または同等）が存在し、外販リリース可否の判定に使える
- [ ] リリース前のテスト実行・CI の役割がドキュメント化されている
- [ ] Phase 1〜4 の成果がチェックリストに反映されている

### 8.3 工数目安

1〜2 時間（チェックリスト作成・既存ドキュメントとの整合）

---

## 9. 実施順序と工数目安

| Phase | 依存 | 工数目安 | 累計目安 |
|-------|------|----------|----------|
| Phase 1 | なし | 2〜4h | 2〜4h |
| Phase 2 | Phase 1 推奨 | 3〜5h | 5〜9h |
| Phase 3 | なし（Phase 1 と並行可） | 2〜4h | 7〜13h |
| Phase 4 | Phase 1 推奨 | 3〜5h | 10〜18h |
| Phase 5 | Phase 1〜4 | 1〜2h | 11〜20h |

- Phase 1 を最優先し、test:all 安定と閾値 80/70 を確実にする。
- Phase 2 と Phase 3 は並行して進めてもよい。
- Phase 4 は API 仕様が固まってから実施すると効率的。
- Phase 5 は Phase 1〜4 の内容を反映したうえで作成する。

---

## 10. リスクと対策

| リスク | 対策 |
|--------|------|
| 分岐 70% に届かない | ボトルネックファイル（admin-api・auth-api・stockAdapters 等）に絞って分岐追加。閾値は「安定して超えたとき」のみ 70 に更新 |
| test:all が flaky | beforeEach での JSON 初期化・時刻・モックの固定。flake 監視で検出し、優先して修正 |
| 工数不足 | Phase 1 を最優先。Phase 2〜5 は「外販直前」にまとめて実施するのではなく、少しずつ進める |
| 外販スコープの変更 | チェックリストと本計画を「外販 v1」用として扱い、スコープが変わったら Phase や完了条件を更新する |

---

## 11. 進捗記録

実施した Phase の日付と成果を記録する。

| Phase | 実施日 | 成果 | 備考 |
|-------|--------|------|------|
| Phase 0 | - | 現状定義（62 スイート・453 テスト・行 87%・分岐 68〜69%） | 本計画の起点 |
| Phase 1 | （未） | - | 分岐 70%・閾値 80/70・test:all 安定 |
| Phase 2 | （未） | - | E2E・負荷・flake 基準化 |
| Phase 3 | （未） | - | セキュリティ・監査強化 |
| Phase 4 | （未） | - | 契約・API 明文化 |
| Phase 5 | （未） | - | 外販リリースチェックリスト |

---

## 12. 参照ドキュメント

- `docs/coverage-improvement-plan.md` … 旧カバレッジ計画・第2期の実施履歴（参考）
- `docs/coverage-targets.md` … カバレッジ目標値・閾値
- `docs/step3-performance-load-flake.md` … 性能監視・負荷試験・flake 監視
- `docs/ci-setup.md` … CI ワークフロー・ブランチ保護
- `jest.config.js` … coverageThreshold 設定
