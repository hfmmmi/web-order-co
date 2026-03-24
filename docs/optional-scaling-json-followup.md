# 任意フォロー: JSON ストアとマルチプロセス（フェーズ3）

**いつ読むか:** 社内運用が安定し、**負荷が増えた・複数台にしたい・同時書きで不具合が出た**とき。

---

## 背景

本システムは業務データを **JSON ファイル** を主にして保持しています。プロセス内では `runWithJsonFileWriteLock` や注文用ロックで競合を緩和していますが、次の限界があります（詳細は [REFACTOR_INVENTORY.md](../REFACTOR_INVENTORY.md)「JSON 書き込み棚卸し」「マルチプロセス」）。

- **Node プロセスを複数**（クラスタ、複数コンテナ）にすると、メモリ上のキューは**共有されない**。
- `customers.json` / `products.json` 等、**キュー未適用の read-modify-write** は高負荷・並行時にリスクが残る。

---

## 本番運用の現実的な方針（4/30 前後）

- **単一プロセス**（PM2 でインスタンス1、または systemd で1サービス）にすると、ファイルロックまわりのリスクは相対的に低い。
- 水平スケールが必要になったら、次のいずれかを検討する（工数大）。

---

## 検討オプション（優先度は状況依存）

1. **JSON 書き込みの直列化を横展開** … [REFACTOR_INVENTORY.md](../REFACTOR_INVENTORY.md) の「未キュー化」箇所を `runWithJsonFileWriteLock` 等で揃える。  
2. **共有ストアへ移行** … SQLite 等、プロセス間で一貫した書き込みモデルにする（設計・移行作業が必要）。  
3. **API のドキュメント化** … URL が `/place-order` と `/api/...` の二系統であることの整理（運用ミス・連携ミスを減らす）。 [.cursorrules](../.cursorrules) の任意改善と同趣旨。

---

## 参照

- [REFACTOR_INVENTORY.md](../REFACTOR_INVENTORY.md)  
- [backup-and-restore-policy.md](backup-and-restore-policy.md) … データ保全の基本はこちらを先に固める
