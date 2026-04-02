# 分岐カバレッジ 90% — フェーズ一覧（目次）

長期目標は **`jest.config.js` の `collectCoverageFrom` に対する分岐カバレッジ 90%**（計測手順はフェーズ1）。各フェーズの役割は次のとおり。

| フェーズ | ドキュメント | 要約 |
|----------|--------------|------|
| 1 | [phase1-baseline](branch-coverage-90-phase1-baseline.md) | 公式計測コマンド、`coverage-summary.json`、90% の完了条件 |
| 2 | [phase2-gap-analysis](branch-coverage-90-phase2-gap-analysis.md) | `coverage:gap-report`、優先度、分岐の種類チェックリスト |
| 3 | [phase3-routes](branch-coverage-90-phase3-routes.md) | ルート層・`supertest`・マウント表 |
| 4 | [phase4-services](branch-coverage-90-phase4-services.md) | サービス層・ユニットテスト |
| 5 | [phase5-middleware-auth](branch-coverage-90-phase5-middleware-auth.md) | ミドルウェア・認証・セッション |
| 6 | [phase6-stock-csv-excel](branch-coverage-90-phase6-stock-csv-excel.md) | ストック・CSV・Excel・アダプタ |
| 7 | [phase7-error-paths](branch-coverage-90-phase7-error-paths.md) | エラー経路・I/O 失敗 |
| 8 | [phase8-ci-threshold-flake](branch-coverage-90-phase8-ci-threshold-flake.md) | 閾値の段階的更新・`test:flake`・CI |
| 9 | [phase9-refactor-testability](branch-coverage-90-phase9-refactor-testability.md) | テスト容易性のための最小リファクタ |
| 10 | [phase10-maintenance](branch-coverage-90-phase10-maintenance.md) | 維持運用・PR ルール・定期レビュー |

## 補助スクリプト・設定

| 項目 | 説明 |
|------|------|
| `npm run coverage:baseline` | レポーター固定でカバレッジ生成（`package.json`） |
| `npm run coverage:baseline:save` | `coverage-summary.json` を `coverage/baselines/` に複製 |
| `npm run coverage:gap-report` | 未充足分岐が多いファイルを一覧 |
| `npm run test:flake` | フレーク検出（`scripts/run-flake-check.js`） |
| `jest.config.js` | `collectCoverageFrom`・`coverageThreshold` |

## 関連（80% 時代の経緯）

- [branch-coverage-80-plan.md](branch-coverage-80-plan.md)
- [flake-log.md](flake-log.md)
