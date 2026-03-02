# ステップ3: 性能監視・負荷試験・flake監視

カバレッジ向上の次のフェーズとして、以下を定常運用に導入する。

## 1. 性能監視（応答時間）

### 概要
全リクエストに対して応答時間を測定し、`X-Response-Time` ヘッダーで返却する。
動作検証テスト:
- `tests/b-rank/step3-performance-monitoring.api.test.js` … X-Response-Time ヘッダ
- `tests/b-rank/step3-load-test-and-perflog.api.test.js` … 閾値超過 exit 1、結果記録フォーマット、PERF_LOG 閾値超過ログ
代表API: POST /api/login, POST /place-order, GET /products 等。

### 仕様
- ミドルウェアにより全レスポンスに `X-Response-Time: Nms` を付与
- オプション: 閾値超過時のみログ出力

### 環境変数
| 変数 | 説明 | 既定値 |
|------|------|--------|
| `ENABLE_PERF_LOG` | `true` で閾値超過時ログ出力 | 未設定（ログなし） |
| `PERF_LOG_THRESHOLD_MS` | ログ出力の閾値（ms） | 1000 |

### 例
```bash
# 1秒以上かかったリクエストのみログ
set ENABLE_PERF_LOG=true
set PERF_LOG_THRESHOLD_MS=1000
npm start
```

---

## 2. 負荷試験（定常運用）

### 概要
代表API 2-3本に対する負荷試験を定期的に実行し、応答時間・スループットの傾向を把握する。

### 対象API
- `GET /api/settings/public` … 公開設定（認証不要）
- `POST /api/login` … ログイン（認証負荷、無効認証で副作用なし）

### 実行手順
1. **別ターミナルでサーバーを起動**
   ```bash
   npm start
   ```
2. **負荷試験を実行**
   ```bash
   npm run test:load
   ```
3. 任意でURLを指定
   ```bash
   node scripts/load-test.js http://localhost:3000
   ```

### 出力例
```
負荷試験: http://127.0.0.1:3000
duration=5s, connections=10, p99閾値=500ms

--- GET /api/settings/public ---
  requests: 5000, latency avg: 2.30ms, p99: 8.50ms
  throughput: 120.00 KB/s, errors: 0
...
```

### 結果記録
- 実行結果を `docs/load-test-results.md` に自動追記
- `LOAD_TEST_SKIP_RECORD=true` で記録をスキップ

### 性能閾値（アサーション）
- p99 が **500ms** を超えた場合、exit code 1 で終了
- `LOAD_TEST_SKIP_THRESHOLD=true` で閾値チェックをスキップ
- `LOAD_TEST_P99_THRESHOLD_MS=N` で閾値を上書き

### 定常運用
- リリース前や定期的（週1回等）に `npm run test:load` を実行
- レイテンシの悪化傾向があれば要因調査

---

## 3. flake監視（不安定テストの記録・修正）

### 概要
APIテストを複数回実行し、run 間で失敗パターンが異なるテスト（flaky）を検出・記録する。

### 実行手順
```bash
npm run test:flake
# 5回実行
node scripts/run-flake-check.js 5
# E2Eも含めて flake チェック（重い）
node scripts/run-flake-check.js 3 --e2e
```

### 動作
- APIテスト（S+A+B+Risk・カバレッジ付き）を既定3回実行
- 一部の run でのみ失敗したスイートを flaky と判定
- 結果を `docs/flake-log.md` に追記

### flake-log.md
検出時は以下の形式で追記される:
```markdown
## 2026-02-17T12:00:00.000Z - flake検出
不安定と判定されたスイート:
- tests/s-rank/foo.api.test.js

実行結果:
- Run 1: PASS
- Run 2: FAIL (tests/s-rank/foo.api.test.js)
- Run 3: PASS

---
```

### 対応方針
- flaky と判定されたスイートは、タイミング依存・テストデータ競合・モック漏れ等を調査
- 修正後、再度 `npm run test:flake` で検証

---

## 4. CI 定期実行

`.github/workflows/step3-periodic.yml` で **毎週日曜 3:00 UTC** に以下を自動実行:
- 負荷試験（閾値チェックはスキップ・記録）
- flake監視（APIテスト 3回）

手動実行: GitHub Actions → Step3 Periodic → Run workflow

## 5. 運用フロー

| タイミング | 実施内容 |
|-----------|----------|
| 変更のたび | `npm run test:all` |
| リリース前 | `npm run test:all` + `npm run test:load` |
| 週1回など | `npm run test:flake`（CI で自動実行可） |
| レイテンシ懸念時 | `ENABLE_PERF_LOG=true` でサーバー起動しログ確認 |
