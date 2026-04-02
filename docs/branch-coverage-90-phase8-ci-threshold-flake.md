# 分岐カバレッジ 90% — フェーズ8（閾値・CI・フレーク対策）

カバレッジ閾値を上げるほど、**実測のブレ**や **テストの不安定性** が CI を赤くしやすくなる。フェーズ8では **段階的な引き上げ**と **フレークの見える化**を固定する。

## `jest.config.js` の `coverageThreshold` を上げるタイミング

1. **`npm run coverage:baseline`** の `total.branches.pct` が、目標値を **複数回・複数環境で安定して**超えている（例: 目標より +0.5〜1pt 以上の余裕が続く）。
2. **`npm run test:flake`**（内部で `scripts/run-flake-check.js`）または手動の複数回 `test:api` で、**失敗パターンが再現性のあるものだけ**になっている。
3. `docs/flake-log.md` に記録されている **既知の不安定テスト**を直す・隔離するなど、対策の状態が整理されている。

**やらないこと**: 実測がまだ揺れているのに、閾値だけ先に上げて CI を常時赤にする（`branch-coverage-80-plan.md` の方針と同じ）。

## 推奨される段階（例）

| 段階 | 操作 |
|------|------|
| 計測 | `coverage:baseline` → `coverage-summary.json` を確認 |
| 記録 | `coverage:baseline:save` または CI アーティファクト |
| 引き上げ | **1pt ずつ**または **実測が明確に上がったタイミング**で `global.branches` を更新 |
| 検証 | PR 前に `npm run test:api`、必要なら `npm run test:flake` |

ファイル別閾値（`middlewares/validate.js` 等）は、**そのファイルの分岐が安定してから**グローバルと整合させる。

## フレーク検出（既存スクリプト）

| コマンド | 内容 |
|----------|------|
| `npm run test:flake` | `run-flake-check.js` が **`test:api` を既定3回**実行し、失敗セットが実行間で変わると flaky 疑い |
| `node scripts/run-flake-check.js N` | 回数 `N` を指定 |
| `node scripts/run-flake-check.js N --e2e` | `test:all` ベースで E2E も含む |

結果・履歴は **`docs/flake-log.md`** に追記する運用が既にある。

## CI でのカバレッジ（推奨）

- PR では **`npm run test:api`**（または `coverage:baseline`）を実行し、`coverage/coverage-summary.json` を **アーティファクト保存**すると、フェーズ1の「公式計測」と揃う。
- 閾値未満で **fail** させるかはチーム判断。**まずはアーティファクトのみ**で推移を見てから、閾値を厳しくするのが安全。

## テスト実行の注意（ブレ低減）

- API テストは **`--runInBand`**（既に `test:api` で使用）を維持し、**ファイル・環境変数の汚染**を防ぐ（フェーズ7）。
- 長時間・多アサーションのファイルは **分割**するとフレーク調査がしやすい（`flake-log.md` に名前が出やすいファイルを参照）。

## フェーズ8の完了条件

1. 本ドキュメントの **閾値の上げ方**と **`test:flake` / `flake-log.md`** の役割が、チーム外にも説明できること。
2. 閾値変更 PR に **実測値またはアーティファクトへの参照**があること（いつ・何％根拠かが分かること）。

---

## 関連ドキュメント

- フェーズ1（計測・90% の定義）: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ9: `docs/branch-coverage-90-phase9-refactor-testability.md`
- フェーズ10: `docs/branch-coverage-90-phase10-maintenance.md`
- フレーク記録: `docs/flake-log.md`
- 全体目次: `docs/branch-coverage-90-index.md`
