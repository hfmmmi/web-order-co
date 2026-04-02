# 分岐カバレッジ 90% — フェーズ2（ギャップ分析の仕組み化）

フェーズ1（`docs/branch-coverage-90-phase1-baseline.md`）で固定した **`coverage-summary.json`** を入力に、**どのファイルの分岐を先に埋めるか**を機械的に並べる。

## 手順（毎回のループ）

0. （任意）スクリプトの動作だけ試す場合:  
   `node scripts/coverage-gap-report.js --summary tests/fixtures/coverage-summary.sample.json`
1. **`npm run coverage:baseline`** で最新の `coverage/coverage-summary.json` を生成する。
2. **`npm run coverage:gap-report`** で優先度一覧を標準出力する。  
   ファイルに残す場合:  
   `npm run coverage:gap-report -- --out coverage/gap-report.md`  
   （`coverage/` は `.gitignore` 対象のため、コミットせずローカル・CI アーティファクト用）
3. **HTML で未カバー行を追う**: `coverage/lcov-report/index.html` を開き、レポート上位のファイルから赤くなっている分岐を確認する。
4. 下記 **分岐の種類チェックリスト** に照らして、テストケースを列挙する。
5. テスト追加後に再度 `coverage:baseline` で効果を確認する。

## 自動レポートのオプション

| オプション | 意味 |
|------------|------|
| `--summary <path>` | `coverage-summary.json` のパス（既定: `coverage/coverage-summary.json`） |
| `--top <n>` | 表示件数（既定: **30**） |
| `--min-branch-total <n>` | 分岐総数が **n 未満**のファイルを除外（小ファイルのノイズを減らす） |
| `--out <path>` | Markdown をファイルへ出力 |

## 優先度の考え方（スクリプトの並び）

- **未充足分岐数（missed）** が多いファイルを上に並べる（＝ここを埋めると全体の分岐％への寄与が大きい）。
- 同率のときは **分岐総数が大きい**、さらに **分岐％が低い**順。

`docs/branch-coverage-80-plan.md` の「影響の大きいファイルから」という方針と一致させている。

## 分岐の種類チェックリスト（テスト設計用）

テストを書くとき、該当コードの `if` / `?:` / `catch` / `switch` がどのパターンかを切り分ける。

| 種類 | 例 | テストのコツ |
|------|-----|----------------|
| **正常系のレア分岐** | 空配列、設定オフ、初回のみの経路 | データを最小・境界にする |
| **catch / I/O** | `ENOENT` 以外、`EACCES`、JSON 破損、書込失敗 | サンドボックス `DATA_DIR` 下でモックまたは失敗注入 |
| **バリデーション** | Zod、手動の `if (!x)` | 境界値・型不正・欠損フィールド |
| **文字列・フォーマット** | CSV ヘッダ言語、日付セル、`#NAME?`、BOM | データ駆動で列を増やす |
| **認証・セッション** | 401/403、Cookie、環境フラグ | `supertest` + ヘッダ／セッション操作 |

## ホットスポット手動リスト（チームで更新）

自動レポートとあわせ、**仕様上重要なファイル**を固定で追う場合に使う。

| ファイル | メモ（例: 直近で伸ばした分岐） |
|----------|--------------------------------|
| | |
| | |

既存の候補の出発点: `docs/branch-coverage-80-plan.md` の優先ファイル表。

## 完了条件（フェーズ2）

- **`npm run coverage:gap-report`** がリポジトリに含まれ、上記手順が **ドキュメントだけで再現できる**こと。
- チームが **「次にどのファイルを見るか」** を `gap-report` と `lcov-report` で合意できること。

## 関連ドキュメント

- フェーズ1（計測・90% の定義）: `docs/branch-coverage-90-phase1-baseline.md`
- フェーズ3（ルート層・API テストの進め方）: `docs/branch-coverage-90-phase3-routes.md`
- フェーズ4（サービス層・ユニットテストの進め方）: `docs/branch-coverage-90-phase4-services.md`
- フェーズ5（ミドルウェア・認証・セッション）: `docs/branch-coverage-90-phase5-middleware-auth.md`
- フェーズ6（ストック・CSV・Excel・アダプタ）: `docs/branch-coverage-90-phase6-stock-csv-excel.md`
- フェーズ7（エラー経路・I/O 失敗）: `docs/branch-coverage-90-phase7-error-paths.md`
- フェーズ8〜10・全体目次: `docs/branch-coverage-90-index.md`
- 80% 計画・経緯: `docs/branch-coverage-80-plan.md`
