# 分岐カバレッジ 90% — フェーズ1（ベースライン固定と定義）

## 公式の計測コマンド

チームで **「カバレッジ何％」を指すとき**は、次のいずれかとする。

| 用途 | コマンド |
|------|-----------|
| **推奨（レポーター固定）** | `npm run coverage:baseline` |
| 既存の日次確認 | `npm run test:api`（`--coverage` のみ。Jest 既定のレポーター） |

`coverage:baseline` は `test:api` と **同じ対象テスト**（s / a / b / risk-driven）・**同じ `collectCoverageFrom`**（`jest.config.js`）で、出力だけ明示している。

## 生成される成果物

`coverage:baseline` 完了後、`coverage/` に少なくとも次が含まれる。

| ファイル | 内容 |
|----------|------|
| `coverage/coverage-summary.json` | ファイル別・全体の行・分岐など（**分岐％の公式参照**に使う） |
| `coverage/lcov.info` | LCOV（`lcov-report` HTML の元） |
| `coverage/lcov-report/index.html` | ブラウザで未カバー分岐を追うとき用 |

分母・対象ファイルは **`jest.config.js` の `collectCoverageFrom`** に従う（`routes` / `services` / `middlewares` と一部 `utils`）。

## マイルストーンの記録方法

1. `npm run coverage:baseline`
2. `npm run coverage:baseline:save`  
   → `coverage/baselines/coverage-summary-<タイムスタンプ>.json` にコピー（ローカル履歴用。`.gitignore` 対象）

CI では `coverage/` ごとアーティファクトとして保存すれば、同じ `coverage-summary.json` を再現できる。

## 分岐 90% の完了条件（フェーズ1で固定する定義）

次を **すべて**満たしたとき、このリポジトリでは「分岐カバレッジ 90% を達成した」とみなす。

1. **`npm run coverage:baseline` の結果**で、`coverage/coverage-summary.json` の **`total.branches.pct` ≥ 90**。
2. **複数回実行**（別日・別マシンでも可）で、表示される分岐％が **大きくブレない**ことを確認したうえで、`jest.config.js` の `coverageThreshold.global.branches` を **90** に更新する（早すぎる引き上げは `docs/flake-log.md` の注意に従う）。
3. **`npm run test:all`**（既存の統合テストフロー）が引き続き通る。

任意: ファイル別の下限（例: 特定の巨大ファイルだけ最低 85%）をチームで追加する場合は、この文書に追記する。

## 実測値のメモ欄（マイルストーン記録用）

| 日付 | total.branches.pct | 備考 |
|------|---------------------|------|
| | | |

## 関連ドキュメント

- **全体目次（フェーズ1〜10）**: `docs/branch-coverage-90-index.md`
- フェーズ2（ギャップ分析・優先度一覧）: `docs/branch-coverage-90-phase2-gap-analysis.md`
- フェーズ3（ルート層・API テストの進め方）: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ4（サービス層・ユニットテストの進め方）: `docs/branch-coverage-90-phase4-services.md`
- フェーズ5（ミドルウェア・認証・セッション）: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ6（ストック・CSV・Excel・アダプタ）: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8（閾値・CI・フレーク）: `docs/branch-coverage-90-phase8-ci-threshold-flake.md`
- フェーズ9（最小リファクタ）: `docs/branch-coverage-90-phase9-refactor-testability.md`
- フェーズ10（維持運用）: `docs/branch-coverage-90-phase10-maintenance.md`
- 80% までの経緯・優先ファイル: `docs/branch-coverage-80-plan.md`
- フレーク調査: `docs/flake-log.md`
