# システム/ファイル構成スリム化設計書

最終更新: 2026-04-06

## 0. 文書メタ情報
- document_id: DOC-SLIM-RESTRUCTURE-001
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

> 注記（2026-04-07）: 本書の中盤以降には移行前の構想（manifests/install 系を含む）が履歴として残っている。現行運用はローカル最小構成で、`mcp/`、`manifests/`、`packaging/`、`scripts/install-*`、`scripts/build-mcp-config.js` は削除済み。

## 1. 目的
本設計書は、現行のマルチエージェント基盤を機能非変更でスリム化し、次の状態へ移行するための実装設計を定義する。

- ルート直下の混在を解消する
- エージェント関連資産を .github / .vscode / copilot-system に責務分離する
- 過去成果物・検証成果物・実行時状態を整理し、保守と監査を容易にする
- 不要機能または回りくどい実装を、機能影響なしで単純化する

## 2. 判定
判定: Go（段階移行で実行可能）

理由:
- 現在の設計意図は既に「skills を source of truth とし .github を配布面に寄せる」方針で一貫している
- インストーラ/バリデータが参照する主要資産は限定されており、責務単位で再配置できる
- 状態・監査・メモリ・レビュー証跡は、運用ディレクトリを分離しても機能要件を維持できる

### 2.1 レビュー結果（本改訂で反映）
- 責務分離: 方針は妥当だが、ディレクトリ単位の責任者と更新権限が未定義だった
- 1機能1実装: source/generated の境界は示されていたが、コンポーネントごとの正本定義が不足していた
- 移行安全性: 参照パス移行時の互換レイヤ、段階解除条件、ロールバック条件が不足していた
- 運用ガード: ルート混在抑止はあるが、生成物ドリフト検知と直接編集抑止の検査観点が不足していた

## 3. 根拠
調査対象:
- README.md
- system-configuration-overview.md
- agent-system-flow.md
- design.md
- feature-design.md
- package.json
- scripts/build-copilot-skills.js
- scripts/validate-configs.js

根拠要約:
- 現在の実行モデルは skills -> .github/skills の生成モデルが中核
- 配布系機能を削減しても、ローカル検証フローで運用継続できる
- 一方で、ルート直下に工程成果物、テスト結果、運用状態、説明資料が混在し、責務境界が曖昧
- plugins/copilot/templates と .github 実体の二重管理があり、同期コストが高い

## 4. 現状課題（スリム化対象）

### 4.1 構造課題
- ルートに phase 成果物（requirements-definition.md 等）、調査資料、テスト結果 JSON、運用状態が混在
- 実行時可変データ（state, cache, audit_log, memory）がソース資産と同列に存在
- エージェント系資産の境界が分散（.github, plugins, docs, ルート成果物）

### 4.2 実装課題
- agents の実体が plugins/copilot/templates/agents と .github/agents で重複
- module:agent-system-skills が sourcePaths と operations の参照先にねじれを持つ（skills 側と .github 側を混在参照）
- validate-configs.js がテンプレート系と生成系の双方存在を同時必須化しており、単一の正本を作りづらい

### 4.3 運用課題
- 過去成果物の残留ルールがなく、何を保持すべきかが都度判断
- 監査ログ/メモリ/状態のローテーション・保持期限ポリシーが弱い
- ルート直下のファイル追加を抑止するガードが不足

## 5. 設計原則（機能非変更）
- 原則1: 動作仕様（フェーズ順序、ゲート、監査、メモリ、レビュー）を変えない
- 原則2: 参照パスのみ段階的に置換し、同等データモデルを維持する
- 原則3: source of truth は 1 つに限定する
- 原則4: 実行時可変データは dedicated フォルダへ隔離する
- 原則5: ルートはエントリポイント最小集合のみ許可する

### 5.1 責任分離原則（RACI簡易）
- .github: Copilot 実行面（配布先）。直接編集は原則禁止、生成/同期のみ許可
- .vscode: ローカル実行設定面。MCP と作業支援設定のみを保持
- copilot-system/src: 正本実装面。skills/templates/manifests/scripts の唯一正本
- copilot-system/runtime: 可変運用面。state/cache/audit/memory の書き込み専用
- copilot-system/docs と tests/results: 説明責任面。設計根拠と検証証跡を保持

### 5.2 1機能1実装ポリシー
- 各機能は「1つの正本ディレクトリ + 1つの生成先」のみを持つ
- 同一機能の手修正可能コピーを複数箇所に持たない
- 例外は移行期間のみ許可し、期限と削除条件を必須で定義する

## 6. 目標ディレクトリ構成

```text
.
├─ .github/
│  ├─ agents/                  # Copilot runtime が読む実体
│  ├─ hooks/                   # Hook 定義
│  ├─ instructions/            # File/Workspace instructions
│  ├─ prompts/                 # Prompt assets
│  ├─ skills/                  # Copilot 配布用（生成物または同期物）
│  └─ copilot-instructions.md
├─ .vscode/
│  ├─ mcp.json                 # MCP 接続設定
│  ├─ settings.json            # ワークスペース設定
│  └─ tasks.json               # 検証/生成タスク
├─ copilot-system/
│  ├─ src/
│  │  ├─ skills/               # 正本スキル（現 skills を移設）
│  │  ├─ templates/
│  │  │  ├─ agents/            # 正本エージェント定義（現 plugins/.../agents）
│  │  │  ├─ hooks/
│  │  │  ├─ prompts/
│  │  │  ├─ instructions/
│  │  │  └─ copilot-instructions.md
│  │  ├─ manifests/            # install-*.json
│  │  └─ scripts/              # build/install/validate スクリプト
│  ├─ runtime/
│  │  ├─ state/
│  │  ├─ cache/
│  │  ├─ audit_log/
│  │  └─ memory/
│  ├─ docs/
│  │  ├─ architecture/
│  │  ├─ operations/
│  │  └─ reports/
│  └─ tests/
│     └─ results/
├─ scripts/                    # 移行期間のみ: copilot-system/src/scripts への薄い委譲
├─ manifests/                  # 移行期間のみ: copilot-system/src/manifests の同期出力
├─ app/                        # 将来の本体実装領域（このリポジトリでは空でも可）
└─ README.md
```

補足:
- .github は「Copilot が直接読む面」に限定
- copilot-system は「開発・生成・運用・証跡の正本」
- app は将来の本体コード群との分離境界
- scripts と manifests は互換維持のため移行期間のみルートに残す。最終的には削除する

### 6.1 正本マッピング（機能別）
| 機能 | 正本（唯一） | 配布/生成先 | 備考 |
|------|--------------|-------------|------|
| Skill 定義 | copilot-system/src/skills | .github/skills | 生成専用、直接編集禁止 |
| Agent 定義 | copilot-system/src/templates/agents | .github/agents | 生成/同期専用 |
| Workspace Instructions | copilot-system/src/templates/copilot-instructions.md | .github/copilot-instructions.md | コピー専用 |
| Hook 定義 | copilot-system/src/templates/hooks | .github/hooks | コピー専用 |
| Prompt/Instructions | copilot-system/src/templates/prompts, instructions | .github/prompts, .github/instructions | コピー専用 |
| Runtime 状態 | copilot-system/runtime | なし | 生成物でなく運用データ |

## 7. 不要/回りくどい機能の整理方針

### 7.1 削減対象（機能非変更で改善可能）
1. agents 二重管理
- 現状: plugins/copilot/templates/agents と .github/agents が実質重複
- 改善: 正本を copilot-system/src/templates/agents に統一し、.github/agents へ生成/同期

2. スキル参照の二重経路
- 現状: source は skills、配布は .github/skills、一部 module で .github を再入力に使用
- 改善: 正本は copilot-system/src/skills のみに固定。配布は常に生成物

3. ルート直下の成果物常駐
- 現状: requirements-definition.md などが root 常駐
- 改善: copilot-system/docs/architecture または reports に移設し、ルートには index 的 README のみ残す

4. テスト結果散在
- 現状: *-test-results.json が root に散在
- 改善: copilot-system/tests/results に集約

### 7.2 維持対象（削らない）
- phase 順序とゲート制御
- audit_log append-only 運用
- memory L0/L1/L2/L3 の階層思想
- cost guard / governance gate / deep review の安全機構

## 8. 再配置と依存解決の実装設計

### 8.1 パス抽象化
scripts 内の固定パス参照を共通 resolver へ寄せる。

- 追加: copilot-system/src/scripts/lib/paths.mjs
- 方針:
  - REPO_ROOT
  - SYSTEM_ROOT = REPO_ROOT/copilot-system
  - RUNTIME_ROOT = SYSTEM_ROOT/runtime
  - COPILOT_SURFACE_ROOT = REPO_ROOT/.github

これにより移設後も機能を維持しやすくする。

### 8.2 生成パイプライン単純化
- build-copilot-skills.js: 入力を SYSTEM_ROOT/src/skills に変更
- install modules: sourcePaths を SYSTEM_ROOT/src/... に統一
- .github 反映は generate/copy のみ（正本を置かない）
- module:agent-system-skills の sourcePaths と operations 参照先を同一正本系統に統一する

### 8.2.1 互換レイヤ設計（破壊的変更防止）
- Phase A: 既存パスを維持しつつ、copilot-system/src を正本化。旧パスは委譲のみ
- Phase B: validate-configs に「旧パス直編集検出」「正本との差分検出」を追加
- Phase C: 2リリース無事故後、ルート scripts/manifests を削除

ロールバック条件:
- install:plan/install:validate の失敗
- .github 生成結果の欠落
- state/current_task.json と audit_log の更新失敗

### 8.3 実行時データ隔離
移設対象:
- state -> copilot-system/runtime/state
- cache -> copilot-system/runtime/cache
- audit_log -> copilot-system/runtime/audit_log
- memory -> copilot-system/runtime/memory

互換性維持:
- 移行期間は旧パスを読む fallback を残し、警告ログを出す
- 2 リリース後に旧パス fallback を削除

### 8.4 ドキュメント整理
移設対象:
- root の設計/要件/報告 md -> copilot-system/docs/architecture または reports

ルート残置:
- README.md
- package.json
- .github/
- .vscode/
- copilot-system/
- app/

### 8.5 フェーズ整合性（既存工程との整合）
- requirement_analysis から complete までの工程順序は state/current_task.json の phase_sequence を正として維持する
- 移設により phase 遷移判定ロジックを変更しない
- ファイル移動は「参照先置換 -> 検証通過 -> 旧参照削除」の順に限定する

## 9. 運用ルール設計

### 9.1 追加するルールファイル
- .github/instructions/repo-layout.instructions.md

適用方針:
- ルート直下に新規 md/json を追加する場合は block（許可リスト除く）
- エージェント関連は .github または copilot-system 以外への配置を禁止
- テスト結果は copilot-system/tests/results 以外を禁止

### 9.2 Hook ルール
- 追加: .github/hooks/repo-layout-gate.json（PreToolUse）
- チェック:
  - 新規作成先が許可パスか
  - runtime 可変データがソース領域に混入していないか
  - .github を正本として直接編集していないか（生成対象を除く）
  - 旧互換パス（ルート scripts/manifests）への新規本実装追加を禁止しているか

### 9.3 命名/ライフサイクル
- reports は YYYYMMDD 接頭辞で時系列化
- tests/results は run-id を含める
- runtime データは保持期間を定義（例: cache 14日、監査ログ 180日）

### 9.4 追加レビュー観点（今回追加）
- 再現性: 生成を2回連続実行して差分ゼロであること
- 可観測性: 失敗時に phase, component, path を監査ログへ残せること
- 復旧性: runtime 配下のみを復元対象にして再起動可能であること
- セキュリティ: runtime に機密を平文保存しないこと
- 依存境界: app と copilot-system の import 依存を一方向に固定すること

### 9.5 ドキュメント運用ルール（将来拡張余地の確保）
- 文書分類を明示する。
  - Normative: 実装拘束力あり（設計、仕様、運用規約）
  - Informative: 参考情報（調査メモ、検証ログ要約）
- Normative 文書は「唯一正本」を必須化し、同テーマの重複文書を禁止する。
- すべての Normative 文書に次のメタ情報を持たせる。
  - document_id
  - status（draft, active, deprecated）
  - owner
  - last_reviewed
  - supersedes（置換対象がある場合）
- 重要変更は ADR（Architecture Decision Record）を必須化する。
  - 変更理由
  - 採用案/不採用案
  - 互換性影響
  - ロールバック条件
- 廃止フローを定義する。
  - deprecate 宣言
  - 互換期間
  - 完全削除日
- stale 管理を定義する。
  - 最終レビューから 30 日超過した active 文書はレビュー対象へ自動列挙

### 9.6 変更管理ルール（実装を止めないための措置）
- 変更の種類を3段階で扱う。
  - patch: 互換影響なし
  - minor: 後方互換ありの拡張
  - major: 後方互換なし
- major は以下を満たすまで着手不可とする。
  - 影響範囲マップ
  - 移行手順
  - ロールバック手順
  - UAT 再実行計画
- 互換性契約を定義する。
  - パス互換（旧パス fallback）
  - スキーマ互換（state/audit/memory）
  - コマンド互換（既存 npm scripts）
- 機能フラグ方針を定義する。
  - 新ガード/新ルールは dry-run -> warn -> enforce の順で段階導入
  - enforce 移行条件を監査ログの失敗率で判定する

### 9.7 自動品質ゲート（運用ルールの実効性担保）
- validate-configs に以下のチェックを追加する。
  - 正本以外への直接編集検出
  - 生成物と正本のドリフト検出
  - ルート直下許可リスト違反検出
- docs 用チェックを追加する。
  - リンク切れ
  - メタ情報欠落
  - status=deprecated の参照残存
- 週次ジョブで以下を実施する。
  - stale 文書一覧生成
  - 互換レイヤ利用率（旧パス参照回数）集計
  - 監査ログ異常率の可視化

段階導入コマンド（運用基準）:
- dry-run: `node scripts/validate-configs.js --mode=dry-run`
- warn: `node scripts/validate-configs.js --mode=warn`
- enforce: `node scripts/validate-configs.js --mode=enforce`
- stale 文書確認: `node scripts/check-docs-stale.js`
- stale 検出イベント監査追記: `node scripts/check-docs-stale.js --write-audit`

移行判断基準:
- 連続 5 回の dry-run/warn 実行で block 対象が 0 の場合に enforce へ昇格する。
- enforce 後に blocker が発生した場合は、1 サイクルのみ warn へ戻し、原因解消後に再昇格する。

### 9.8 役割と責任（オーナーシップ）
- docs owner: Normative 文書の整合性と更新承認
- runtime owner: state/cache/audit/memory の保持・復旧ルール管理
- build owner: scripts/manifests/生成パイプライン整合管理
- gate owner: hooks/instructions の block 条件管理
- owner 不在期間の代理承認者を事前登録する

## 10. 実施ロードマップ（工程順序準拠）

1. requirement_analysis
- 対象ファイルを責務ラベル化（source/generated/runtime/report）

2. requirement_definition
- 非機能要件として「配置ガード」「正本一意」「ルート最小化」を追記

3. specification
- パス解決仕様と fallback 期間を定義

4. delivery_planning
- バッチ移行順（scripts -> manifests -> docs -> runtime）を固定

5. design
- 目標ツリーと参照関係図を確定

6. implementation
- パス resolver 導入
- ディレクトリ移設
- 生成/検証スクリプト更新

7. fast_review
- 参照切れ、生成漏れ、ルート混入のみを高速確認

8. deep_review
- ガバナンス、監査、memory 整合、fallback 除去計画を審査

9. uat
- install:plan/apply/validate、validate-configs、validate-skills を実行

10. complete
- 旧パス参照 0 件と運用ルール有効化を確認

## 11. 受け入れ基準
- AC-1: ルート直下の運用ファイル（state/cache/audit/memory/report）が 0 件
- AC-2: source of truth が skills/agents/templates それぞれ 1 箇所
- AC-3: .github は配布面のみで再生成可能
- AC-4: 既存検証コマンドがすべて成功
- AC-5: Hook によりルート混入が再発しない
- AC-6: 生成コマンド2回連続実行で差分ゼロ
- AC-7: 旧パス互換レイヤを無効化しても UAT が通過
- AC-8: module:agent-system-skills の参照ねじれが解消されている
- AC-9: Normative 文書に必須メタ情報が 100% 付与されている
- AC-10: stale 文書検出ジョブが動作し、30日超過文書を列挙できる
- AC-11: dry-run -> warn -> enforce の段階導入が記録されている
- AC-12: major 変更に ADR とロールバック手順が紐づいている

## 12. リスクと対策
- リスク: パス移設でスクリプト参照切れ
  - 対策: fallback + 段階移行 + CI で旧/新両パス検証
- リスク: 既存利用者の手動運用手順が破綻
  - 対策: README に移行マップと互換期間を明記
- リスク: 生成物の更新漏れ
  - 対策: validate-configs に「生成物が正本に一致」を追加
- リスク: Windows 環境でパス区切り差による解決失敗
  - 対策: paths resolver を導入し、path.join/path.resolve のみを使用
- リスク: .github 配下を直接修正して正本と乖離
  - 対策: レイアウトゲートで直接編集を警告/拒否
- リスク: ルール増加で運用負荷が上がる
  - 対策: patch は軽量審査、major のみ厳格審査に分離する
- リスク: stale 判定が過検知となる
  - 対策: owner が除外ラベルを一時付与できる運用を用意する

## 13. 次アクション
1. 本設計書を基準として、移行対象一覧（現パス -> 新パス）を CSV で作成する
2. paths resolver 実装と scripts の参照差し替えを先行実施する
3. repo-layout gate を導入し、以降の変更で混在再発を抑止する
4. validate-configs.js に「正本/生成物整合チェック」「直接編集検出」を追加する
5. module:agent-system-skills の参照ねじれ修正を最優先で実施する
6. Normative 文書メタ情報テンプレートを作成し、既存文書へ一括適用する
7. ADR テンプレートと major 変更時の必須チェックリストを追加する
8. stale 文書検出と互換レイヤ利用率集計の週次ジョブを導入する

## 14. 実ファイル検証結果（2026-04-07）

### 14.1 判定
- 現時点判定: 達成（ローカル最小構成）
- 理由: 削減対象は実体削除済みで、コア機能を維持したままローカル検証が通過している

### 14.2 ベースライン検証（実行結果）
- `node scripts/validate-skills.js`: pass
- `node scripts/validate-configs.js`: pass
- `node .github/hooks/hooks-integration-test.js`: pass

### 14.3 重大指摘（移行前に必須で解消）
1) ルート固定パス依存が高密度
- 影響: ルート直下から成果物/state/runtime を移すと Hook と運用スクリプトが即時失敗
- 代表箇所:
  - `.github/hooks/artifact-gate.js` の required_files と episode パス
  - `.github/hooks/phase-transition-guard.js` の `state/current_task.json`
  - `.github/hooks/governance-gate.js` の `review-report.md`
  - `.github/hooks/scripts/*.js` の固定参照
  - `scripts/memory/lib.mjs` の policy 既定値（memory 配下固定）

2) agents の二重正本が成立していない
- 影響: 単一正本へ移す際、どちらを正とするか誤ると機能欠落
- 実測:
  - `plugins/copilot/templates/agents` に存在しない agent が多数
  - 共通3ファイル（explorer/reviewer/docs-researcher）も内容差分あり

3) skill 正本の一部品質問題
- 影響: source 側を正本化した場合、再生成時に内容劣化リスク
- 実測:
  - `skills/baseline-metrics/SKILL.md` と `.github/skills/baseline-metrics/SKILL.md` が不一致
  - `skills/memory-distillation/SKILL.md` と `.github/skills/memory-distillation/SKILL.md` が不一致

4) module:agent-system-skills の参照ねじれ
- 影響: manifest 上の sourcePaths は `skills/..` だが operation は `.github/skills/..` を参照し、責務が混線
- 該当: `manifests/install-modules.json`

### 14.4 中程度指摘（移行時に同時対応推奨）
1) packaging 初期化が旧パス固定
- 該当: `packaging/setup.ps1`（state, cache, audit_log, review-report の固定生成）

2) 仕様/運用文書の大量リンクがルート前提
- 影響: ドキュメント移動後にリンク切れと gate 判定齟齬が発生
- 該当: `feature-design.md`, `system-specification.md`, `docs/AGENT-REFERENCE.md` ほか

3) Hook 設定の script パス固定
- 該当: `.github/hooks/*.json` の `node .github/hooks/scripts/...`

### 14.5 移行前の必須条件（Gate）
- G1: path resolver を scripts と hooks 共通で導入し、固定パス参照を抽象化する
- G2: agent 正本を一本化し、install profile が参照するモジュールを単一経路へ統合する
- G3: 上記2 skill の文字化け/差分を解消し、source と generated の一致を回復する
- G4: artifact-gate/phase-transition/governance/uat-trigger の参照先を新旧互換で動作させる
- G5: docs 移設前にリンク検証を自動化し、破断ゼロを確認する

### 14.6 移行実施の推奨順序（機能維持優先）
1. 参照抽象化（resolver 導入）
2. runtime パス互換（旧->新 fallback）
3. agents/skills の正本一本化
4. manifests/install scripts の参照統一
5. docs 移設とリンク更新
6. 互換レイヤ解除（2リリース無事故後）

### 14.7 完了判定の追加
- AC-13: Hook 統合テストが新パス/旧パス互換モードの両方で pass
- AC-14: install:plan/install:apply/install:validate が新構成で pass
- AC-15: agents/skills の正本ディレクトリ以外に手編集差分が存在しない

## 15. 実装ステータス（2026-04-07）

### 15.1 達成済み
- ルート混入抑止ゲート導入（repo-layout instruction + hook）
- validate-configs の段階導入（dry-run/warn/enforce）
- skills source/generated ドリフト検知
- docs メタ情報検査と stale 検出ジョブ実装
- Hook 共通 path resolver の最小実装（artifact/phase/governance へ適用）
- ADR テンプレートと採用 ADR の追加

### 15.2 未達成（前提変更により現構成では対象外）
- install:plan/install:apply/install:validate の新構成 pass（削除済み）
- manifests ベースの module 参照ねじれ修正（manifests 削除済み）

### 15.3 代替達成条件（現ローカル最小構成）
- `node scripts/validate-skills.js` が pass
- `node scripts/validate-configs.js --mode=enforce` が pass
- `node scripts/check-docs-stale.js` が pass
- `node .github/hooks/hooks-integration-test.js` が pass

### 15.4 差分確認と残作業実行結果（2026-04-07）

#### 目的
- 現システムと本設計書の差分を再確認し、現構成で実行可能な残作業を完了させる。

#### 判定
- 判定: 完了（現ローカル最小構成における残作業なし）

#### 根拠
- 設計書 13 章の次アクションは、現構成で有効な項目について実装済みであることを実測確認。
  - `docs/SLIM-MIGRATION-MAP.csv` が存在
  - `.github/hooks/lib/paths.js` が存在し、`artifact-gate.js`、`phase-transition-guard.js`、`governance-gate.js` で利用
  - `scripts/validate-configs.js` で `--mode=dry-run|warn|enforce` と skill drift 検知が有効
  - `.github/hooks/repo-layout-gate.json` と `.github/hooks/scripts/repo-layout-check.js` が存在
  - `package.json` に docs stale 検査と監査追記コマンドが存在
- 本日実行した検証コマンド結果:
  - `node scripts/validate-skills.js`: pass
  - `node scripts/validate-configs.js --mode=enforce`: pass
  - `node scripts/check-docs-stale.js`: pass（stale 0, metadata_missing 0）
  - `node .github/hooks/hooks-integration-test.js`: pass（21/21）
  - `node scripts/scan-secrets.js`: pass
- 設計書 15.2 の未達成項目は、`manifests/` と install 系の削除により「現構成では対象外」のまま変化なし。

#### 次アクション
1. 定期運用として `npm run check` と `node .github/hooks/hooks-integration-test.js` を継続実行する。
2. 追加変更時は `node scripts/validate-configs.js --mode=enforce` を必須化し、再混入を抑止する。

### 15.5 copilot-system 実体化と runtime 移設結果（2026-04-07）

#### 目的
- `copilot-system` フォルダを実体化し、runtime データをルート直下から移設する。

#### 判定
- 判定: 完了（runtime 領域）

#### 実施内容
- 追加:
  - `copilot-system/runtime/`
- 移動:
  - `state/` -> `copilot-system/runtime/state/`
  - `cache/` -> `copilot-system/runtime/cache/`
  - `audit_log/` -> `copilot-system/runtime/audit_log/`
  - `memory/` -> `copilot-system/runtime/memory/`
- 参照更新（新パス優先 + 旧パス fallback）:
  - `.github/hooks/lib/paths.js`
  - `.github/hooks/audit-logger.js`
  - `.github/hooks/scripts/artifact-gate-check.js`
  - `.github/hooks/scripts/check-phase-transition.js`
  - `.github/hooks/scripts/trigger-uat.js`
  - `.github/hooks/artifact-gate.js`
  - `scripts/memory/lib.mjs`
  - `scripts/check-docs-stale.js`
  - `scripts/validate-configs.js`
  - `.github/hooks/scripts/repo-layout-check.js`
  - `.github/instructions/repo-layout.instructions.md`

#### 根拠（再検証）
- `node scripts/validate-skills.js`: pass
- `node scripts/validate-configs.js --mode=enforce`: pass
- `node scripts/check-docs-stale.js`: pass
- `node .github/hooks/hooks-integration-test.js`: pass（21/21）
- `node scripts/scan-secrets.js`: pass

### 15.6 docs 移設結果（2026-04-07）

#### 目的
- 設計/運用文書を `copilot-system/docs/` へ集約し、ルート直下混在を解消する。

#### 判定
- 判定: 完了

#### 実施内容
- 移動:
  - `docs/` -> `copilot-system/docs/`
- 参照追従:
  - `scripts/check-docs-stale.js`（docs root 解決を新パス優先へ）
  - `scripts/validate-configs.js`（メタ情報検査対象を新パス優先へ）
  - `.github/hooks/hooks-integration-test.js`（設計書参照先更新）

#### 根拠（再検証）
- `node scripts/validate-configs.js --mode=enforce`: pass
- `node scripts/check-docs-stale.js`: pass
- `node .github/hooks/hooks-integration-test.js`: pass（21/21）
