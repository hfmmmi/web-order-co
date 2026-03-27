# 運用リスク対策ドキュメント一覧

## 計画の完了条件（セルフチェック）

- [ ] 原因カテゴリ（学習メモの表）に対し、各対策ドキュメントがどの原因に効くか説明できる。
- [ ] [production-environment-checklist.md](production-environment-checklist.md) をデプロイ前に実際に使った。
- [ ] [post-deploy-smoke-test.md](post-deploy-smoke-test.md) を本番またはステージングで1回以上実施し、記録表に日付を記入した。
- [ ] ローカルで `DATA_DIR=tests/_sandbox_data` を付けて `npm run test:all`（または `test:api`）を通した（手順は [test-execution.md](test-execution.md)）。

---

「顧客迷惑・バグ・システムダウン」を **ゼロにはできない** 前提で、発生確率と影響を下げるための社内用まとめです。

| ドキュメント | 内容 |
|--------------|------|
| [operational-risk-learning.md](operational-risk-learning.md) | バグ/ダウン/迷惑の分け方、顧客ジャーニー例、読む順番 |
| [production-environment-checklist.md](production-environment-checklist.md) | 本番環境変数・HTTPS・セッション・デプロイ前チェック |
| [cloud-vps-production-setup.md](cloud-vps-production-setup.md) | クラウド VPS・常駐・プロキシ・ファイアウォールの要点 |
| [vps-production-runbook.md](vps-production-runbook.md) | **本番 VPS の実作業まとめ（SSH・Phase F/G・DNS・systemd・貼り付け用）** |
| [backup-and-restore-policy.md](backup-and-restore-policy.md) | バックアップ頻度・対象・復旧手順のテンプレ |
| [release-test-discipline.md](release-test-discipline.md) | `test:api` / `test:all` の使い分けと本番ルール |
| [post-deploy-smoke-test.md](post-deploy-smoke-test.md) | デプロイ後の手動確認手順と実施記録 |
| [optional-scaling-json-followup.md](optional-scaling-json-followup.md) | JSON ストア・マルチプロセス（余力で） |

既存ドキュメントとの関係:

- テスト実行と `DATA_DIR`: [test-execution.md](test-execution.md)  
- セッション永続化の詳細: [session-production.md](session-production.md)  
- JSON 書き込みの技術的棚卸し: [../REFACTOR_INVENTORY.md](../REFACTOR_INVENTORY.md)

---

## 障害・メンテのコミュニケーション（1行でも決める）

技術対策と別に、次を社内で決めておくと「迷惑」の体感が減ります。

- **障害時:** 誰が「調査中／復旧見込み」を社内に連絡するか（掲示・メール等）。
- **メンテ:** 利用停止が必要なとき、事前にいつ止めるか告知できるか。
- **バックアップ:** 復旧したとき「最大どれくらい古い状態に戻るか」（[backup-and-restore-policy.md](backup-and-restore-policy.md) の RPO）を共有する。
