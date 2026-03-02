# テスト実行手順（本番データ保護）

ローカルで `npm run test:all` や `npm run test:api` を実行するときは、**必ずテスト用の DATA_DIR を設定してから**実行してください。  
設定を忘れると、安全装置によりテスト開始直後にエラーで止まり、業務用の JSON には一切触れません。

---

## 手順（PowerShell）

以下を **そのまま貼り付けて実行**すれば問題ありません。

```powershell
# 1回だけ作っておく（初回または tests\_sandbox_data がない場合）
mkdir tests\_sandbox_data

# テスト前のターミナルで毎回これをセット
$env:DATA_DIR = "tests/_sandbox_data"

# そのあとで
npm run test:all
```

- **1行目**：テスト用ディレクトリ `tests\_sandbox_data` を用意（既にある場合はスキップしてよい）。
- **2行目**：そのターミナルで「テストはこのフォルダだけを使う」と指定。**ターミナルを開き直すたびに、テストを流す前に再度実行が必要**です。
- **3行目**：いつも通り全テストを実行。

`test:api` だけ流したい場合は、最後の行を `npm run test:api` に変えてください。

---

## 補足

- **DATA_DIR を設定せずに** `npm run test:all` だけ打つと、「安全装置: テスト実行前に必ず DATA_DIR を…」というエラーで即終了します（業務用 JSON は触れません）。
- テスト実行の方法を聞かれたら、このファイル（`docs/test-execution.md`）を参照するようにしてください。
