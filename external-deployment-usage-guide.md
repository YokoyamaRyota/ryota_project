# 別フォルダ実装・使用方法ガイド

最終更新: 2026-04-05
対象: 本ワークスペースで構築した VS Code Copilot マルチエージェント開発システムを、別フォルダへ再実装して運用開始する担当者

---

## 1. 目的

このドキュメントは、以下を再現可能にすることを目的とする。

- 本システムを別フォルダへ移植して起動する
- 工程順序ゲート、成果物ゲート、監査ログ、ガバナンス、UAT トリガを有効化する
- 実装後に最終テストを実行して、運用可能状態を確認する

---

## 2. 判定

本ガイドに従った再実装の完了判定は、次の条件をすべて満たした場合に Pass とする。

1. 必須フォルダと必須ファイルが新規フォルダに配置されている
2. Hooks 統合テストが pass している
3. Governance 統合テストが pass している
4. Planner/Memory テストが pass している
5. state/current_task.json が uat または complete フェーズへ遷移可能な状態になっている
6. review-report.md に承認記録が残せる

---

## 3. 根拠

### 3.1 要件トレーサビリティ

本システムの主要要求と、再実装で成立させる要素の対応は次の通り。

- FR-13d 工程順序強制: phase-transition-guard
- FR-13e 成果物更新完了ゲート: artifact-gate
- FR-19a 監査ログ最低仕様: audit-logger
- FR-25 トレーサビリティ同期: governance-gate
- FR-26 UAT シナリオ起動: uat-trigger
- FR-05 コストガード: cost-guard

### 3.2 再実装対象（コピー対象）

別フォルダへ最低限コピーする。

- .github/
  - agents/
  - hooks/
  - instructions/
  - plugins/
  - prompts/
  - skills/
  - copilot-instructions.md
- state/
- audit_log/
- cache/
- memory/
- requirements-definition.md
- system-specification.md
- delivery-plan.md
- design.md
- feature-design.md
- review-report.md

### 3.3 前提条件

- OS: Windows 推奨（PowerShell 実行を含むため）
- Node.js: v20 以上（現行実績は v24 系）
- VS Code + GitHub Copilot Chat 利用可能
- 新規フォルダ配下に書込権限あり

---

## 4. 別フォルダへの実装手順

### 4.0 配布パッケージを使う場合（推奨）

本リポジトリには配布パッケージ生成スクリプトを同梱している。

配布元で次を実行する。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release-package.ps1
```

生成物:

- dist/copilot-agent-system-package/
- dist/copilot-agent-system-package.zip

注記:

- 既存の出力フォルダが使用中の場合、`copilot-agent-system-package-YYYYMMDD-HHMMSS` 形式で自動的に別名出力される。

配布先は zip を展開して、次の 1 コマンドでセットアップ完了。

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -RunValidation
```

GitHub 配布例:

1. 生成した zip をリポジトリの Release に添付する
2. 利用者は Release から zip をダウンロードして展開する
3. 展開先で上記 1 コマンドを実行する

### 4.1 新規フォルダ作成

1. 任意の場所に新規フォルダを作成する
2. そのフォルダを VS Code で開く

例:

```powershell
New-Item -ItemType Directory -Path C:\work\agent-system-clone
```

### 4.2 ファイル配置

1. 3.2 の対象を元フォルダから新フォルダへコピーする
2. 相対パス構造を維持する

### 4.3 初期状態の確認

新フォルダで次を確認する。

- .github/hooks/hooks-integration-test.js が存在する
- state/current_task.json が存在する
- audit_log/events.jsonl が存在する

例:

```powershell
Test-Path .github/hooks/hooks-integration-test.js
Test-Path state/current_task.json
Test-Path audit_log/events.jsonl
```

### 4.4 Hooks 設定の有効性確認

1. .github/hooks/*.json の windows コマンドが新フォルダでも有効か確認
2. run-node-hook.ps1 への相対パスが崩れていないことを確認

---

## 5. 使用方法（運用フロー）

### 5.1 標準運用

1. 要求投入
2. Request Analyzer で分類
3. requirement_definition -> specification -> delivery_planning -> design
4. implementation
5. fast_review / deep_review
6. uat
7. complete

### 5.2 実行コマンド（最終テスト）

新フォルダのルートで実行する。

```powershell
node .github/hooks/hooks-integration-test.js
node .github/hooks/governance-integration-test.js
node .github/plugins/planner-cache-test.js
node .github/plugins/memory-retriever-test.js
```

期待結果:

- hooks-integration-test-results.json: overall_status = passed
- governance-integration-test-results.json: status = passed
- planner-cache-memory-retriever-test-results.json: planner/memory ともに passed

### 5.3 完了反映

最終テスト pass 後に次を更新する。

- review-report.md
  - 判定結果
  - review_evidence_id
  - approval_timestamp_utc
- state/current_task.json
  - current_phase = complete
  - current_workflow.status = final_test_completed
  - uat_pending = false

---

## 6. 受け入れ確認チェックリスト

- [ ] 必須ファイル構成をコピー完了
- [ ] hooks-integration-test が pass
- [ ] governance-integration-test が pass
- [ ] planner/memory テストが pass
- [ ] review-report.md の承認記録更新完了
- [ ] state/current_task.json の complete 遷移完了

---

## 7. トラブルシュート

### 7.1 node コマンドが見つからない

症状:

- hooks スクリプト実行時に node not found

対処:

1. Node.js をインストール
2. PowerShell を再起動
3. Get-Command node で確認

### 7.2 Artifact Gate で MUST_HAVE_MISSING が出る

症状:

- 見出し名不一致で gate deny

対処:

1. artifact-gate.js の must_have_fields と対象文書の見出しを一致させる
2. 文書側の見出しを要件通りへ修正

### 7.3 UAT_TRIGGERED が多重記録される

症状:

- audit_log/events.jsonl に UAT_TRIGGERED が連続記録

対処:

1. trigger-uat.js の重複防止キー条件を確認
2. current_task.json の uat_pending 状態遷移を確認

---

## 8. 次アクション

1. scripts/build-release-package.ps1 の実行を CI ジョブへ組み込み、自動で zip を作る
2. GitHub Release に dist/copilot-agent-system-package.zip を公開する
3. Phase 2 運用前に UAT 実行結果を review-report.md へ自動追記する仕組みを追加する
