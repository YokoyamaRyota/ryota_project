# ローカルスリム化 実行手順書

最終更新: 2026-04-07

## 0. 文書メタ情報
- document_id: DOC-SLIMMING-EXEC-001
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

## 1. 目的
本手順書は、ローカル実装に不要な配布系機能と外部連携系機能を削減し、開発に必要な最小構成へ段階的に移行するための実行手順を定義する。

## 2. 判定
判定: 完了（ローカル最小構成の維持確認済み）

判定基準:
- 不要機能の削除と参照除去が完了している
- コア機能（Hookゲート、監査、メモリ、skills生成）が維持されている
- ローカル検証コマンドが成功している

## 3. 根拠
- docs/CURRENT-SYSTEM-IMPROVEMENT-DESIGN.md の 13章/14章で、ローカル先行スリム化対象が定義済み
- mcp/install/release/migrate 関連は削除済みで、ローカル最小構成へ移行済み
- cost-guard/budget-state 削除後も hooks/config 検証が通ることを確認済み

## 4. 実行手順
1. 事前確認
- 削除対象の参照を全検索し、依存ファイルを確定する
- コア機能の維持対象を固定する

2. スクリプトと検証の最小化
- package.json から mcp/install/memory:migrate/release 系スクリプトを削除する
- scripts/validate-configs.js から mcp/install 前提チェックを除去する

3. 不要ファイルの削除
- mcp/ 一式
- manifests/ 一式
- scripts/build-mcp-config.js
- scripts/install-plan.mjs
- scripts/install-apply.mjs
- scripts/install-validate.mjs
- scripts/list-installables.mjs
- scripts/build-release-package.ps1
- packaging/ 一式
- external-deployment-usage-guide.md
- scripts/memory/migrate-memory.mjs

4. ドキュメント更新
- README.md をローカル実装導線に更新する
- mcp/install/migrate に依存する実行手順を更新する

5. 最終検証
- node scripts/validate-skills.js
- node scripts/validate-configs.js
- node scripts/scan-secrets.js
- node .github/hooks/hooks-integration-test.js

## 5. 進捗チェック
- [x] Step 1: 事前確認
- [x] Step 2: スクリプトと検証の最小化
- [x] Step 3: 不要ファイルの削除
- [x] Step 4: ドキュメント更新
- [x] Step 5: 最終検証

## 6. 次アクション
1. 主要検証（validate-configs / validate-skills / scan-secrets / hooks integration test）を定期実行する
2. 新規変更時は削除済み機能（mcp/install/release/migrate）への参照再混入を検知する

## 7. フォルダ整理プロセス

### 7.1 状態
- フォルダ整理プロセス実行済み
- keep 対象のみを残す形で物理削除を完了

### 7.2 実施結果
- ルート構成を最小セットへ整理
- 削除後に `scripts/validate-configs.js` の obsolete 参照を修正し、再検証で成功

### 7.3 次ステップ
1. 運用設計書の記述を現行構成に同期し続ける
2. 検証失敗時は削除済み資産への固定参照を優先的に確認する
