# GitHub に push するとは？（イメージと手順）

## イメージ

- **いま**: あなたのPCのフォルダ（web-order）にだけ、テスト修正などの「変更」がある。
- **push する**: その変更を「GitHub 上の同じリポジトリ」に**送って保存**すること。
- **結果**: GitHub のページ（https://github.com/hfmmmi/web-order-co）で、同じ内容が見られる。他の人もそのリポジトリから取得できる。

```
[あなたのPC]  web-order フォルダ（変更あり）
       │
       │  git add → git commit → git push
       ▼
[GitHub]  hfmmmi/web-order-co リポジトリ（同じ内容が保存される）
```

---

## 何をするか（3ステップ）

### 1. 変更を「ステージング」する（どのファイルを送るか選ぶ）

```powershell
cd c:\Users\user\Desktop\program\web-order

# テストやコードの修正だけ送りたい場合（データファイルや coverage は除く例）
git add .cursorrules .gitignore
git add jest.config.js playwright.config.js
git add routes/admin-api.js services/mailService.js services/stockService.js
git add tests/
git add docs/test-execution.md
# 必要なら docs/ci-setup.md なども
```

※ 本番データ（admins.json, customers.json, orders.json など）や coverage フォルダは、通常は **add しない** か、.gitignore で除外します。

### 2. コミットする（「この内容でひとまとまり」と記録する）

```powershell
git commit -m "テスト修正: E2E代理ログイン・excel-readerタイムアウト・captchaリセット先をE2E用に"
```

`-m` の後は、何をしたか分かる短いメッセージを書きます。

### 3. push する（GitHub に送る）

```powershell
git push origin main
```

※ ブランチ名が `master` の場合は `git push origin master` にします。

---

## 初回や認証で聞かれたら

- **ブランチ名の確認**: `git branch` で現在のブランチ（例: main / master）を確認できます。
- **ログイン**: push 時に GitHub のユーザー名・パスワード（または Personal Access Token）を聞かれたら入力します。パスワードは「Personal Access Token」を使う必要がある場合があります（GitHub の設定で発行）。

---

## push 後に起きること

- GitHub のリポジトリページを開くと、今 push したコミットが表示されます。
- CI を設定していれば、push に連動して「テスト実行」が自動で走り、結果が GitHub 上で確認できます。

---

## まとめ

| やること     | コマンドの例           | 意味                         |
|-------------|------------------------|------------------------------|
| 送るファイルを選ぶ | `git add ファイル名`   | この変更を次のコミットに含める |
| 記録する     | `git commit -m "メッセージ"` | ひとまとまりとして保存        |
| 送る         | `git push origin main` | GitHub にアップロード         |
