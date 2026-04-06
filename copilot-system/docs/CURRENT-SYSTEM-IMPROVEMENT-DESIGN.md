# 現行システム改良設計書（機能重複・不要機能・実装妥当性）

最終更新: 2026-04-07

## 0. 文書メタ情報
- document_id: DOC-CURRENT-IMPROVEMENT-001
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

## 1. 目的
本書は、現行システムの機能を維持しながら、次の観点で改良案を定義する。

- 機能が重複している箇所の特定と統合
- 不要または効果が薄い実装の整理
- 実装方法の妥当性評価（正しい/要修正/廃止）
- 今後の拡張を阻害しない構成への改善

## 2. 判定
判定: 達成（ローカル最小構成）

理由:
- ローカル最小構成への削除対象（mcp/manifests/install/release/migrate）は実体削除済み
- コア機能（phase/artifact/governance/audit hooks、memory scripts、skills生成）は維持されている
- 現行のローカル検証コマンドは pass している

## 3. 根拠
実測した主な事実:

- `node scripts/validate-skills.js` pass（Validated 26 source skills）
- `node scripts/validate-configs.js` pass（local mode）
- `node scripts/scan-secrets.js` pass
- `node .github/hooks/hooks-integration-test.js` pass（18/18）
- agent 定義は `.github/agents` で一元管理されている

参照ファイル:
- `scripts/validate-configs.js`
- `.github/hooks/artifact-gate.js`
- `.github/hooks/phase-transition-guard.js`
- `.github/hooks/governance-gate.js`
- `.github/hooks/scripts/*.js`
- `scripts/memory/lib.mjs`

## 4. 現行機能マップ（要約）

### 4.1 実行制御
- Coordinator と各 agent が phase ベースで実行
- Hook が phase gate, artifact gate, governance gate, audit を補助

### 4.2 配布/生成
- skills は `skills/` から `.github/skills/` へ生成
- 配布系（install/manifests）は削除し、ローカル検証フローへ一本化

### 4.3 運用データ
- `state/`, `audit_log/`, `memory/`, `cache/` にランタイム状態を保存

## 5. 機能重複の特定と改良案

| 項目 | 現状 | 問題 | 改良案 |
|------|------|------|--------|
| Agent 正本 | `.github/agents` に統一済み | 参照元文書の旧記述が残る場合がある | agent 定義変更時は `.github/agents` を唯一の正本として更新する |
| Skill 供給経路 | generated と authored copy が混在 | 生成方針の一貫性欠如 | skill は全量 generated に統一 |
| 配布設定 | install/manifests が削除済み | 履歴文書と現状が乖離しやすい | ローカル運用文書を正として明記し、履歴記述を分離 |
| Hook チェック | `artifact-gate` と `phase-transition` で一部責務重複 | 変更時に同期漏れが起きる | 共通 gate ライブラリ化で責務を集約 |

## 6. 不要機能・縮小候補

### 6.1 不要（または統合可能）
1. ルート直下と docs の重複説明
- 同じ運用ルールが複数文書に分散している
- 改善: Normative 文書1本 + 補助文書参照に統一

2. install module の冗長 copy operation
- `.github` から `.github` への自己コピーが存在
- 改善: no-op operation を禁止し検証で弾く

3. Hook script ごとの個別パス解決
- 類似実装が複数箇所に分散
- 改善: 共通 resolver を導入

### 6.2 維持すべき機能
- phase 順序制御
- audit append-only
- governance gate
- memory 階層モデル

## 7. 実装妥当性評価

| 対象 | 評価 | コメント |
|------|------|---------|
| `scripts/build-copilot-skills.js` | 概ね妥当 | 生成責務は明確。入力パス抽象化を追加すべき |
| `scripts/validate-configs.js` | 概ね妥当 | local mode へ移行済み。削除済み資産の再参照検知は継続強化余地あり |
| install/manifests 系 | 削除済み | ローカル最小構成の対象外 |
| `.github/hooks/artifact-gate.js` | 要修正 | 固定パス依存が強く移設に弱い |
| `.github/hooks/phase-transition-guard.js` | 要修正 | state パス固定で拡張性が低い |
| `.github/hooks/governance-gate.js` | 要修正 | review-report 固定参照で配置変更に弱い |
| `scripts/memory/lib.mjs` | 要修正 | memory policy がルート固定 |

## 8. 改良アーキテクチャ方針

### 8.1 単一正本原則
- Agents: 正本1箇所
- Skills: 正本1箇所（generated only）
- Hooks: 実行定義とスクリプトの責務を分離し、共通ライブラリ化

### 8.2 パス抽象化
- すべての scripts/hooks で resolver 経由参照
- 旧パス fallback は期限付きで許可

### 8.3 ルール実効化
- validate-configs に追加:
  - no-op copy 禁止
  - 正本外編集検出
  - source/generated ドリフト検出

### 8.4 現在の最小構成
- 維持: `.github/`, `scripts/`, `skills/`, `state/`, `memory/`, `audit_log/`, `cache/`
- 削除済み: `mcp/`, `manifests/`, `packaging/`, `scripts/install-*`, `scripts/build-mcp-config.js`, `scripts/build-release-package.ps1`, `scripts/memory/migrate-memory.mjs`

## 9. 実装優先順位

### Phase A（即時）
1. `module:agent-system-skills` 参照ねじれ解消
2. baseline-metrics, memory-distillation の source/generated 一致回復
3. validate-configs にドリフト検出追加

### Phase B（短期）
1. hook 共通 resolver 導入
2. scripts/memory の policy パス抽象化
3. agent 正本統一（旧経路は read-only 化）

### Phase C（中期）
1. 互換レイヤ利用率が閾値以下になった段階で旧経路を削除
2. 運用文書リンクの新構成へ全面更新

## 10. 受け入れ基準
- AC-1: agent 正本が1箇所に統一される
- AC-2: skills の source/generated 差分が 0
- AC-3: ローカル最小構成で不要機能が実体削除されている
- AC-4: hooks/scripts が resolver 経由で新旧パス互換を持つ
- AC-5: validate-configs で no-op copy と正本外編集が検出可能
- AC-6: 既存検証コマンド + hook 統合テストが pass

## 11. リスク
- 過剰統合による初期移行コスト増
- 互換レイヤを長期残置した場合の技術的負債固定化
- ドキュメント更新の遅れによる運用齟齬

## 12. 次アクション
1. hook/scripts 共通 resolver の最小実装を追加する
2. validate-configs にドリフト検出（削除済み資産への再参照検知）を追加する
3. `.github/agents` と `skills/` を正本とした更新ルールを運用文書へ明記する
4. ローカル検証（validate-skills/validate-configs/scan-secrets/hooks test）を定期実行する

## 13. ローカル先行スリム化モード

### 13.1 目的
ローカル環境での実装速度を最優先し、配布・外部連携・完成後運用向け機能を現環境から最大限削減する。

### 13.2 判定
判定: Go（機能維持可能）

条件:
- phase 制御、hook gate、state/audit/memory は維持する
- 削除対象は Git 履歴で復元可能とし、現ワークツリーには残さない

### 13.3 再調査結果（メモリ・外部機能含む）

1. 配布機能群はローカル実装に必須ではない
- 根拠: `install:*` と `build-release-package` は配布時のみ利用

2. MCP 機能は現時点で runtime 必須ではない
- 根拠: README に「MCP catalog は installer へ未接続」と明記されている

3. メモリ機能は分離が必要
- 維持必須: `normalize`, `retrieve`, `consolidate`（agent/hook と仕様が参照）
- 削減候補: `migrate-memory.mjs`（移行専用ワンショット）

4. `validate-configs.js` はローカルモードへ移行済み
- 根拠: mcp/install/plugins 旧テンプレート前提チェックを除去済み

### 13.4 現環境から削除してよい機能（ローカル開発に不要）

| 区分 | 対象機能 | 対象ファイル/コマンド | 処置 |
|------|----------|------------------------|------|
| 配布 | install plan/apply/list | `scripts/install-plan.mjs`, `scripts/install-apply.mjs`, `scripts/list-installables.mjs`, `package.json` の `install:*` | 現環境から削除 |
| 配布状態管理 | target metadata / install state | `module:target-copilot-adapter`, `module:install-state`, `.super-skills/*` | manifests 参照から除外 |
| 外部配布 | release package | `scripts/build-release-package.ps1`, `packaging/*`, `external-deployment-usage-guide.md` | 現環境から削除 |
| 外部メタ | mcp catalog build/validate | `scripts/build-mcp-config.js`, `mcp/*`, `package.json` の `build:mcp-config`, `validate:mcp` | 現環境から削除 |
| 移行専用メモリ | migration utility | `scripts/memory/migrate-memory.mjs`, `package.json` の `memory:migrate` | 現環境から削除 |

### 13.5 削除してはいけない機能（ローカルでも必須）

| 区分 | 対象機能 | 対象ファイル |
|------|----------|-------------|
| 実行品質 | phase transition / artifact / governance gate | `.github/hooks/phase-transition-guard.js`, `.github/hooks/artifact-gate.js`, `.github/hooks/governance-gate.js` |
| 監査 | append-only audit log | `.github/hooks/audit-logger.js`, `audit_log/events.jsonl` |
| 状態管理 | task state | `state/current_task.json` |
| 記憶（コア） | decision/retrieval/distill | `scripts/memory/normalize-memory.mjs`, `scripts/memory/retrieve-memory.mjs`, `scripts/memory/consolidate-memory.mjs`, `memory/*` |
| スキル生成 | skills -> .github/skills | `scripts/build-copilot-skills.js`, `scripts/validate-skills.js` |

### 13.6 ほかの削減候補（今回再調査分）

| 候補 | 現状 | 推奨処置 |
|------|------|----------|
| `manifests/*` 一式 | install 機能前提 | 現環境から削除（再開時は Git から復元） |
| `scripts/validate-configs.js` 内 mcp/install 検証 | 削除済み | local mode の最小検証を維持 |
| `README.md` の install 手順 | 配布前提の手順が主導線 | ローカル導線（build/validate/hook test）を先頭へ移動 |
| `docs/COPILOT-CUSTOMIZATIONS-TEST.md` | install/apply 前提 | ローカルモード専用チェックリストへ置換 |

### 13.7 ローカル最大スリム化ルール
1. 削除対象は「現環境から物理削除」する（退避フォルダは作らない）。
2. 削除前に依存参照を grep で 0 件化する。
3. `check` はローカル必須検証のみで再定義する。
4. ドキュメントは配布手順を分離し、ローカル手順を正規導線にする。
5. 復元は Git 履歴から実施する前提とする。

### 13.8 受け入れ基準（ローカル最大スリム化）
- LAC-1: install/apply/release/mcp/migrate を削除しても通常タスクが完走する
- LAC-2: hook gate と state/audit/memory の更新が維持される
- LAC-3: `node scripts/validate-skills.js` とローカル検証コマンドが pass
- LAC-4: `.github/agents`, `.github/hooks`, `scripts/memory` の機能回帰がない

### 13.9 次アクション（ローカル先行・即時実施順）
1. `package.json` から `install:*`, `build:mcp-config`, `validate:mcp`, `memory:migrate` を除去する
2. `scripts/validate-configs.js` から mcp/install 前提検証を外し、ローカル専用検証へ変更する
3. `manifests/*`, `scripts/install-*.mjs`, `scripts/list-installables.mjs`, `scripts/build-mcp-config.js`, `scripts/build-release-package.ps1`, `packaging/*`, `mcp/*`, `external-deployment-usage-guide.md` を削除する
4. README と関連 docs をローカル実装前提へ更新する

## 14. MCP と HOOK の再評価

### 14.1 目的
MCP と HOOK について、現行実装の機能・役割・必要性を再評価し、ローカル最大スリム化の実施可否を確定する。

### 14.2 判定
判定:
- MCP: 削除済み
- HOOK: コア機能は維持（cost-guard は削除済み）

### 14.3 根拠

#### MCP の現行機能と役割
- 2026-04-07 時点で削除済み（ローカル最小構成）

#### HOOK の現行機能と役割
- 役割: 実行時ガードと監査
- 実装（主要）:
  - `artifact-gate`（成果物整合）
  - `phase-transition-guard`（工程順序）
  - `governance-gate`（承認・トレーサビリティ）
  - `audit-logger`（append-only 監査）
- 重要事実:
  - `.github/hooks/*.json` で PreToolUse/SessionStart/Stop に実際接続済み
  - `hooks-integration-test.js` で統合テスト対象になっている

### 14.4 必要性の再評価結果

| 区分 | 機能 | 必要性 | 判定理由 | ローカル最大スリム化方針 |
|------|------|--------|----------|--------------------------|
| MCP | catalog/profiles/build script | 低 | 実行本体に未接続 | 削除済み |
| HOOK-必須 | artifact/phase/governance/audit | 高 | phase 制御と品質/監査の実行ガード | 維持 |
| HOOK-準必須 | decision-gate-sla, uat-trigger | 中 | 運用効率・補助機能 | 先に warn-only へ縮退後、必要なら削除 |
| HOOK-テスト | hooks-integration-test, governance-integration-test | 中 | 回帰防止 | ローカルでも維持推奨 |

### 14.5 削減優先順位（MCP/HOOK 観点）
1. MCP 一式削除を維持する（再導入しない）
2. `validate-configs.js` を local mode のまま維持する
3. HOOK のうち補助系（cost/decision-sla/uat-trigger）を warn-only 化
4. コア HOOK（artifact/phase/governance/audit）を維持

### 14.6 受け入れ基準（MCP/HOOK 再評価）
- HMAC-1: MCP 削除後も phase 実行フローが完走する
- HMAC-2: PreToolUse の 3 ゲート（artifact/phase/governance）が動作する
- HMAC-3: audit_log/events.jsonl へイベント追記が継続する
- HMAC-4: hooks 統合テストが pass する

### 14.7 次アクション
1. MCP 削除対象の実ファイル削除計画を確定する
2. HOOK を core と optional に分類し、設定ファイルを二層化する
3. optional HOOK を warn-only に変更して1週間観測する
4. 観測結果で optional HOOK の最終要否を決定する
