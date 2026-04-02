# 分岐カバレッジ 90% — フェーズ10（維持運用・回帰防止）

一度 90% に近づいても、**機能追加・リファクタ**で分岐が増えたり、テストが古くなったりするとカバレッジは落ちる。フェーズ10では **ルールと定期メンテ**で勢いを維持する。

## 単一の情報源（このリポジトリ）

| 内容 | 主なドキュメント |
|------|------------------|
| 計測の定義・完了条件 | `docs/branch-coverage-90-phase1-baseline.md` |
| 優先度付け | `docs/branch-coverage-90-phase2-gap-analysis.md` + `npm run coverage:gap-report` |
| ルート〜エラー・CI・リファクタ | `branch-coverage-90-phase3` 〜 `phase9` の各ドキュメント |
| 80% までの経緯・ファイル単位メモ | `docs/branch-coverage-80-plan.md` |
| フレーク | `docs/flake-log.md` |
| **全体目次** | `docs/branch-coverage-90-index.md` |

新しい方針は **既存ドキュメントを更新**し、チャットや口頭だけに残さない。

## PR でのおすすめルール（チーム合意で採用）

1. **`collectCoverageFrom` に入るコード**を増やす（新規 `routes` / `services` など）場合、**同じ PR または直後の PR**でテストを追加する。
2. カバレッジを **意図的に下げる変更**（大量の分岐追加など）には、PR 説明に **理由とフォローアップ**を書く。
3. `jest.config.js` の **`coverageThreshold` を上げる**変更は、フェーズ8の基準（実測の安定・フレーク確認）を満たす。

## 定期メンテナンス（目安）

| 頻度 | 作業 |
|------|------|
| 月1回など | `coverage:baseline` → `coverage:gap-report` で **上位の未充足ファイル**を確認し、チケット化 |
| リリース前 | `npm run test:all` と、必要なら `test:flake` |
| 閾値見直し | フェーズ8に従い、**ブレが小さいことを確認してから**引き上げ |

## 仕様変更と「死んだ分岐」

- 機能削除で **到達不能になった分岐**は、コード側の整理も検討する（分母・分子の両方に効く）。
- テストだけが残り、仕様とズレている場合は **テストを直す**（回帰の誤検知を防ぐ）。

## フェーズ10の完了条件

1. **維持運用のルール**が本ドキュメントと `branch-coverage-90-index.md` から辿れること。
2. カバレッジ作業の **担当交代**がしやすい状態（手順がドキュメント化されていること）。

---

## 関連ドキュメント

- 全体目次: `docs/branch-coverage-90-index.md`
- フェーズ8（閾値・フレーク）: `docs/branch-coverage-90-phase8-ci-threshold-flake.md`
- フェーズ1: `docs/branch-coverage-90-phase1-baseline.md`
