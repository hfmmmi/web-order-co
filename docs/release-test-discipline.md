# リリース前後のテスト運用ルール

コード変更が **顧客迷惑・バグ・ダウン** の確率を下げるための、チーム（1人保守でも）向けルールです。

---

## 1. コマンドの意味

| コマンド | 内容 | いつ使うか |
|----------|------|------------|
| `npm run test:api` | Jest（S+A+B+Risk）＋カバレッジ | **日常の変更のたび**（PR 前・コミット前の推奨） |
| `npm run test:all` | API → E2E → 負荷 → flake（[scripts/run-test-all.js](../scripts/run-test-all.js)） | **本番リリース直前**、大きな変更のあと |
| `npm run test:e2e` | Playwright のみ | E2E だけ再確認したいとき |

---

## 2. 本番データを守る（必須）

- ローカルで API / 全テストを流すときは **[test-execution.md](test-execution.md)** のとおり **`DATA_DIR=tests/_sandbox_data`** を設定する。
- **本番サーバー上では `npm test` / `npm run test:api` / `npm run test:all` を実行しない。**  
  - 理由: 本番の `DATA_DIR` 未設定だとプロジェクト直下の JSON を読み書きする設計のため、環境によっては業務データに触れる恐れがある。CI は専用環境で `DATA_DIR` を設定済み（`.github/workflows/ci.yml`）。

---

## 3. 推奨フロー

1. 機能追加・修正を開発ブランチで行う。  
2. **`npm run test:api`** がすべて PASS してからマージまたは本番取り込み。  
3. 本番リリース前に **`npm run test:all`** をローカルまたは CI で PASS 確認。  
4. 本番デプロイ後は [post-deploy-smoke-test.md](post-deploy-smoke-test.md) を実施。

---

## 4. テストが「保証しない」こと（心構え）

- 本番 DNS・メール到達・実ユーザの全ブラウザ・全入力パターン。  
- インフラ（ディスク満杯、ネットワーク断、証明書期限切れ）。  
→ これらは [production-environment-checklist.md](production-environment-checklist.md) とバックアップ・監視で補う。

---

## 5. Flaky（不安定）テスト

不安定なテストが出たら [flake-log.md](flake-log.md) に記録し、再発時に優先修正する（計画どおり）。

---

## 参照

- [operational-risk-index.md](operational-risk-index.md) … 運用リスク対策ドキュメント一覧  
- [test-execution.md](test-execution.md) … PowerShell での `DATA_DIR` 設定手順
