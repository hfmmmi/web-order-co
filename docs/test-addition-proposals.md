# テスト追加提案（.cursorrules 解析に基づく）

.cursorrules のアーキテクチャ・F-10/F-11・カバレッジ現状を解析し、**追加した方がよいテスト**を優先度付きで提案する。

**実施済み（2026-02-17）**: 以下を実装し、`npm run test:all`（= `test:api` → `test:e2e`）で実行されるように統合済み。
- 招待トークン 24h・1回使用（invite-token-expiry-and-single-use.api.test.js）
- 再設定トークン 1回使用・期限切れ（reset-token-single-use-and-expiry.api.test.js）
- 管理者表示名サニタイズ（sanitize-admin-name.api.test.js）
- 納期目安 更新→顧客履歴一致（order-estimate-message.api.test.js）
- excelReader ユニット（excel-reader.unit.test.js）
- お知らせ category order/general（announcements-category.api.test.js）
- products-api 境界拡張（keyword 0件・cart-details 不正 code）・recaptcha-sitekey 未設定時（recaptcha-sitekey-unset.api.test.js）
- E2E: setup.html id&key 表示（setup-invite-vs-reset-display.spec.js）・代理ログインフロー（proxy-login-flow.spec.js）

---

## 1. 優先度 P0〜P1（受注・認証・業務継続）

### 1.1 招待トークン境界（P1）

- **仕様**: invite_tokens.json は 24時間有効・1回使用で無効化（F-2）。
- **現状**: invite_tokens の退避/復元は testSandbox にあるが、**24h 境界・1回使用後の拒否**の API テストは見当たらない。
- **提案**:
  - **Aランク**: 招待トークン「有効期限内で1回目→成功」「2回目同一トークン→拒否」「期限切れ→拒否」を時刻固定で検証する `invite-token-expiry-and-single-use.api.test.js` を追加。

### 1.2 パスワード再設定トークン境界（P1）

- **仕様**: reset_tokens.json は 24h・1回使用（F-3）。レート制限は session-fixation-and-rate-limit-boundary で 14:59/15:00 を検証済み。
- **提案**:
  - **Aランク**: 再設定トークン「1回使用後の再利用→拒否」「期限切れ→拒否」を検証する `reset-token-single-use-and-expiry.api.test.js` を追加（必要なら request-password-reset 〜 setup 完了までの流れの境界に拡張）。

### 1.3 管理者表示名サニタイズ（P1・XSS）

- **仕様**: auth-api の `sanitizeAdminName`（長さ100・`<>"\'&` 除去）。ログイン時と proxy-request 返却に適用（F-6）。
- **現状**: テスト内で `sanitizeAdminName` や proxy-request の adminName のサニタイズ結果をアサートするテストは見当たらない。
- **提案**:
  - **Aランク**: 管理者ログインまたは proxy-request 取得時に、adminName に危険文字を含むデータで「サニタイズされた値だけが返る」ことを検証するテストを追加（`security-boundaries.api.test.js` 拡張または `sanitize-admin-name.api.test.js` 新規）。

### 1.4 納期目安（estimateMessage）の一貫性（P2）

- **仕様**: orders.json の `deliveryInfo.estimateMessage` を管理画面で更新し、顧客履歴で表示（B. orders-api / C. admin-orders）。
- **現状**: coverage 用に estimateMessage を埋めたテストはあるが、**管理 API で更新 → 顧客 order-history で同一値が返る**一貫性のテストは明示的でない可能性あり。
- **提案**:
  - **Bランク**: `update-order-status` で estimateMessage を更新したあと、顧客側 GET `/order-history` でその注文の estimateMessage が一致することを検証するケースを追加（既存 operations または product-cart-and-announcements に含めるか、`order-estimate-message.api.test.js` として分離）。

---

## 2. カバレッジ・サービス層（P1〜P2）

### 2.1 services 全体（行 50.91%・分岐 30.31%）

- **現状**: routes 経由の間接カバーが中心で、**services 単体のユニットテスト**が少ない。
- **提案**:
  - **utils/excelReader.js**: collectCoverageFrom に含まれるが、**直接 require して readToRowArrays / readToObjects / excelSerialToDateString 等を叩くユニットテスト**が無い。A/B ランクに `excel-reader.unit.test.js` を追加し、正常・空ファイル・壊れた Excel の境界を検証する。
  - **settingsService**: getAnnouncements(target, category) の category 省略時「全件」と category 指定時「order/general」の切り分けをユニットまたは API 経由で明示的にテストする（announcements-date-filtering は日付境界が中心のため）。
  - **mailService**: 既存でモック多用のため、applyTemplate のプレースホルダ置換（`{{customerName}}` 等）が正しく動くことをユニットで検証するテストがあると安心（login-failure-alert-template に近い拡張）。
  - **stockService**: 在庫 CRUD・引当・解放・履歴の主要パスを API 経由またはサービス直接でカバーするテストを追加すると、services カバレッジと「在庫設定/手動調整」の回帰防止に有効。

### 2.2 products-api（行 74.73%・分岐 56.72%）

- **提案**: 閾値は未設定だが、F-10 の B ランクで「商品/カート/価格反映」が重要。在庫付与（stockInfo/stockUi）の「非公開・倉庫別・登録倉庫名」の組み合わせは stock-visibility-combinations で一部カバー済み。**keyword 検索で 0 件のときのレスポンス**や **cart-details の不正 productCode** など境界を 1 ファイルにまとめた `products-api-boundaries.api.test.js` の拡張で対応可能。

---

## 3. 入力検証・拡張（P2・余力）

- **仕様**: F-8 で Phase 1 は 6 API の body 検証済み。「他 API への適用や query/params スキーマ追加を検討」とある。
- **提案**:
  - **query/params**: 既に validate-middleware で query/params の成功・unknown key・型不正を検証済み。**実際の API で validateQuery/validateParams を使っているエンドポイント**（例: GET /orders の query）について、境界値（page=0, limit 超過など）のテストを追加すると、入力検証の実効性が明確になる。
  - **他 API**: 6 API 以外で body を受け取る API に Zod を適用する場合は、その都度 request-validation 系のテストを 1 ケースずつ追加。

---

## 4. E2E（P2〜P3）

### 4.1 setup.html の表示分岐（P1〜P2）

- **仕様**: F-2。URL に `id&key` がある場合は ID・現在 PW 欄を非表示、新パスワードのみ。招待と再設定の両方に対応。
- **現状**: E2E で setup を開き「id&key あり→入力欄が新パスワードのみ」を検証する spec は見当たらない。
- **提案**:
  - **E2E**: `setup-invite-vs-reset-display.spec.js` を追加。`setup.html?id=xxx&key=yyy` で開いたとき、ID・現在 PW が DOM 上に無く、新パスワード欄だけあることをアサート（key が不正でも表示仕様は同じでよい）。

### 4.2 代理ログイン E2E（P1 業務）

- **仕様**: F-5。管理者が申請 → 顧客が許可/却下 → 管理者が「代理ログインを実行」→ 顧客画面に遷移。終了で管理に戻る。
- **現状**: API では proxy-login-expiry / proxy-logout-restore 等あり。E2E で「管理→申請→顧客が許可→管理で実行→商品一覧が見える」までを通す spec は無い可能性が高い。
- **提案**:
  - **E2E**: `proxy-login-flow.spec.js` を追加。同一ブラウザで管理者ログイン → 顧客管理で代理申請 → 別タブ/ウィンドウで顧客ログイン → 許可 → 管理者側で「代理ログインを実行」→ 顧客画面に遷移することを検証。終了ボタンで管理に戻ることも検証（副作用復元を忘れずに）。

### 4.3 120分無操作・セッション切れ（P0 の UI 側）

- **仕様**: server.js で無操作 120 分でセッション失効。S ランクで 119:59/120:00 は API で検証済み。
- **提案**:
  - **E2E**: セッション失効後に顧客/管理画面で操作するとログイン画面にリダイレクトされることを、**時刻をモックまたは短いタイムアウトでシミュレート**して検証する spec は負荷が高く flaky になりがち。余力があれば「失効後 next request で 401 相当 → フロントがログインへ飛ばす」の軽いシミュレーション程度を検討。

---

## 5. 司令塔・インフラ（P2〜P3）

### 5.1 server.js の挙動

- **仕様**: 120分監視・X-Response-Time・stockPoller 起動・CSP・CORS・TRUST_PROXY・メモリストアフォールバックなど。
- **現状**: app を require してルートを叩くテストは多数あるが、**listen 前のミドルウェア順・X-Response-Time の付与**は step3-performance-monitoring で検証済み。**stockPoller の起動**や **SESSION_SECRET 未設定時の警告**は直接テストされていない。
- **提案**:
  - **Bランク**: `server-middleware-and-headers.api.test.js` のような名前で、app を使い「任意のルートで X-Response-Time が付与される」「CSP がかかっている」ことを再確認する程度は既に step3 / csp-headers でカバー可能。stockPoller はタイマー依存のため、CI で起動だけ確認する軽いテストか、ドキュメントで「手動確認」と明記するので十分な場合あり。

### 5.2 MAIL_PASSWORD 本番必須（P2）

- **仕様**: 本番は `MAIL_PASSWORD` 必須、settings.json に平文保存禁止（F. システム設定）。
- **現状**: server-env-behavior で NODE_ENV や TRUST_PROXY の差分は触れている。MAIL_PASSWORD 未設定で本番時にメール送信がどう振る舞うか（警告・送信失敗）はテストで明示されていない可能性あり。
- **提案**:
  - **A/B ランク**: NODE_ENV=production かつ MAIL_PASSWORD 未設定のとき、getMailConfig や mailService がパスワードをどう扱うか（フォールバックしない等）をユニットまたは統合で 1 ケース追加。環境変数をいじるため、テスト内で process.env を退避・復元する必要あり。

---

## 6. 回帰・リスク駆動（P3-P4）

- **feature OFF 時の直アクセス・表示**: risk-driven と E2E で拡張済み（.cursorrules 記載）。
- **提案**:
  - **お知らせ category の取り違え**: orderBanners は category=order のみ。getAnnouncements に general を渡して order が混ざらないことを 1 テストで固定化すると、将来の変更時の回帰を防げる。
  - **recaptcha 未設定時**: siteKey/secretKey が空のとき、ログインで CAPTCHA が不要になることは captcha-required-response 等でカバーされている。**公開 API で recaptchaSiteKey が含まれない**ことを 1 アサート追加すると安心。

---

## 7. まとめ（実施順の目安）

| 優先度 | 内容 | 想定ランク/種別 |
|--------|------|------------------|
| P1 | 招待トークン 24h・1回使用 境界 | A ランク API |
| P1 | 再設定トークン 1回使用・期限切れ 境界 | A ランク API |
| P1 | 管理者表示名サニタイズ（XSS） | A ランク API |
| P1 | setup.html の id&key 時表示（新パスワードのみ） | E2E |
| P1〜P2 | 代理ログイン E2E（申請→許可→実行→終了） | E2E |
| P2 | 納期目安 更新→顧客履歴で一致 | B ランク API |
| P2 | excelReader ユニット（正常・空・壊れ） | A/B ランク Unit |
| P2 | settingsService getAnnouncements(category) | A ランク Unit/API |
| P2 | stockService 主要パス（CRUD・引当・解放） | B ランク API |
| P2 | products-api 境界の拡張（0件・不正 code） | B ランク API |
| P2 | 本番 MAIL_PASSWORD 未設定時の挙動 | A ランク（実施済み: server-env-behavior） |
| P3 | お知らせ order/general 混在しないこと | Risk/B ランク |
| P3 | recaptchaSiteKey 未設定時は公開 API に含まれない | A ランク |

「未網羅（次の追加候補）」を .cursorrules で更新する場合は、上記のうち実施した項目を F-11 に反映するとよい。
