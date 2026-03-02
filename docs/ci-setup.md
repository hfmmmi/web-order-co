# CI と品質ゲートの設定

## CI ワークフロー

`.github/workflows/ci.yml` により、以下が自動で実行されます。

- **トリガー**: `main` / `master` / `develop` への push または pull_request
- **内容**: `npm run test:all`（S → A → B → Risk → E2E の全テスト）

## PR での品質ゲート（マージ前に必須にする）

GitHub のブランチ保護ルールで、**テストが通らないとマージできない**ようにできます。

1. リポジトリ → **Settings** → **Branches**
2. **Add branch protection rule** をクリック
3. **Branch name pattern** に `main` または `master` を入力
4. 次を有効化:
   - **Require status checks to pass before merging**
   - **Require branches to be up to date before merging**
   - チェック一覧から **test**（CI ジョブ名）を選択
5. **Create** で保存

これで、PR をマージするには CI が成功している必要があります。
