# 次スレッドでの指示例

以下のいずれかをコピーして、次のスレッドの最初のメッセージとして使ってください。

---

## パターンA：カバレッジ分岐70%・閾値80/70 を優先する場合

```
.cursorrules を参照して、次を実施してください。

1) まず npm run test:api で全通過を確認する。
2) 分岐カバレッジを 70% に到達させるための追加テストを入れ、安定して 70% を超えたら jest.config.js の coverageThreshold.global を { lines: 80, branches: 70 } に更新する。計画は docs/coverage-improvement-plan.md §12.7。
3) 余力があれば npm run test:all で API → E2E → 負荷 → flake まで全通過するか確認する。
```

---

## パターンB：test:all 全通過の確認を優先する場合

```
.cursorrules を参照して、次を実施してください。

1) npm run test:all を実行し、API・E2E・負荷・flake の4ステップがすべて PASS するか確認する。失敗があれば修正する。
2) 余力があれば、分岐カバレッジ 70% 到達 → jest 閾値 80/70 更新に取り組む。計画は docs/coverage-improvement-plan.md §12.7。
```

---

## パターンC：両方とも同じ優先度で進める場合

```
.cursorrules を参照して、次を実施してください。

1) npm run test:api で全通過を確認し、必要なら修正する。
2) npm run test:all で API → E2E → 負荷 → flake まで全通過するか確認し、失敗があれば修正する。
3) 分岐カバレッジ 70% 到達のための追加テストを入れ、安定して 70% を超えたら jest.config.js の global 閾値を 80/70 に更新する。計画は docs/coverage-improvement-plan.md §12.7。
```

---

## 補足（現状）

- **test:api**：62スイート・444テストで安定して PASS（login_rate_limit / 監査ログ / CAPTCHA / 在庫表示 / proxy まわりの flaky は解消済み）。
- **カバレッジ**：行 86.82%、分岐 67.85〜68.06%（ばらつきあり）。閾値 80/70 には未達。
- **test:all**：API 以降（E2E・負荷・flake）の最終確認は前スレッドでは未実施。必要に応じて次スレッドで実行推奨。
