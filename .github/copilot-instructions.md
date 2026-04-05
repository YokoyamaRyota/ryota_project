# VS Code Copilot Workspace Instructions

**最終更新**: 2026-04-05  
**Phase**: 2 (Week 5 - 強化段階)

---

## 1. プロジェクト概要

本プロジェクトは、VS Code Copilot のマルチエージェントワークフローを構築し、開発タスクの要求整理から実装・レビュー・記憶管理まで、体系的に実行するシステムです。

**主要目標**:
- ユーザー要求の正確な理解と実行
- 工程順序の遵守と成果物の整合性確保
- 記憶継承によるスループット向上
- コスト・リスク・品質のバランス

**プロジェクト文書の対応**:

| ドキュメント | 役割 |
|------------|------|
| `user-requirements.md` | ユーザー要求の定義 |
| `requirements-definition.md` | ビジネス要求・KPI定義 |
| `system-specification.md` | 要件定義（FR/NFR/OR/AC） |
| `design.md` | 全体設計・アーキテクチャ |
| `feature-design.md` | Copilot プリミティブの詳細設計 |
| `delivery-plan.md` | 実装スケジュール・検証計画 |

---

## 2. 全体ワークフロー

### 2.1 工程順序（必須遵守）

```
1. 要求定義 (requirements-definition.md 差分確認)
2. 要件定義 (system-specification.md 更新)
3. デリバリープラン (delivery-plan.md 作成/更新)
4. 設計      (design.md / feature-design.md 更新)
5. 実装      (コード実装)
6. レビュー  (Fast Gate → Deep Review)
```

**重要**: 工程スキップ・逆戻り工程内での作業は承認されません。下流で問題検出時は該当上流工程へ出戻ります。

### 2.2 ハンドオフ契約（全フェーズ遷移で必須）

フェーズ間では以下 5 項目を含む契約オブジェクトを受け渡します：

```json
{
  "goal": "実現すべき最終成果物",
  "constraints": ["必須制約リスト"],
  "done_criteria": ["完了条件リスト"],
  "out_of_scope": ["スコープ外要件"],
  "acceptance_tests": ["受け入れテストシナリオ"]
}
```

### 2.3 状態ファイル

- **`state/current_task.json`**: 現在のタスク・工程・予算状態
- **`state/budget_state.json`**: premium request の予算残高・警告状態
- **`audit_log/events.jsonl`**: append-only イベントログ
- **`memory/core.md`**: Tier-1 Core（常時ロード）
- **`cache/planner/`**: Planner フェーズの再利用キャッシュ

---

## 3. エージェント責務分離

### 3.1 Coordinator（オーケストレーター）

**役割**: 全体の工程制御・意思決定ゲート・成果物整合確認

**責務**:
- 工程順序の厳守（FR-13d）
- 各工程の成果物更新確認（FR-13e）
- state/ ファイルの読み書き（状態管理）
- サブエージェント呼び出しの順序制御
- 記憶ロード・ガバナンス処理の委譲

**呼び出し時機**: 新規タスク開始、タスク再開、ガバナンスレビュー

### 3.2 Request Analyzer

**役割**: ユーザー要求の解析と分類

**処理**: 要求を `known_pattern / new_required_capability / ambiguous_request` に分類し、task_contract JSON を生成

### 3.3 Planner

**役割**: 分解と計画

**処理**: 要求を実装ステップに分解し、依存関係と実行順序を定義

**キャッシュ対象**: task_contract のセマンティックハッシュが一致し TTL 内の場合は再利用

### 3.4 Implementer

**役割**: コード実装・タスク実行

**処理**: 計画に従い、実装を実行。タイムアウト時は最小結果を返却

### 3.5 Fast Gate / Deep Review

**役割**: 段階的レビュー

**Fast Gate**: 重大リスク高速チェック（20秒）  
**Deep Review**: 詳細レビュー（60秒、コストガード対象外）

### 3.6 Episode Writer

**役割**: タスク完了時の記憶記録

**処理**: `episodes/<task_id>.md` に task_contract・採用案・drift・レビュー結果を記録

**禁止事項**: hard drift が未解消のタスク、出戻り後のタスクは記録しない

### 3.7 Memory Retriever → 3.11 Distillation Worker

**Tier-1 Core**: 常時ロード（2000トークン以内）  
**Tier-2/3**: 関連度上位のみ取得

**蒸留**: episodes/ が閾値に達したら Distillation Worker を呼び出し、archive/ へ移動

### 3.8 Governance（ガバナンス - Phase 2 有効化）

**役割**: FR-25（トレーサビリティ同期）/ FR-27（Change Request）

**処理**: 
- `source_ur_id → mapped_br_id → validation_ac_id → review_evidence_id` の整合検査
- Change Request の起票・承認状態管理
- 不整合・未承認は release ブロック

### 3.9 UAT Runner（ユーザー受け入れテスト - Phase 2 有効化）

**役割**: FR-26（UAT シナリオ実行）

**処理**: Simple / Medium / Complex の代表シナリオを実行し、pass/fail/conditional-pass を記録

### 3.10 Decision Gate

**役割**: ユーザー意思決定の確認・記録

**処理**: 複数案提示後、ユーザー選択を待機。4時間超過で催促、24時間超過で suspended 遷移

---

## 4. Hook 責務分離

### 4.1 artifact-gate.json

**Trigger**: PreToolUse（工程遷移時）

**責務**: 成果物更新の整合性のみを検査（FR-13e）

**判定逆域**: ファイル存在・更新時刻・sync_status

### 4.2 governance-gate.json

**Trigger**: PreToolUse（レビュー完了後の release 判定時）

**責務**: 承認状態・トレーサビリティ・工程違反を統合判定（FR-25, FR-27）

**判定順序**:
1. 工程順序違反 → deny: `PHASE_GATE_FAIL`
2. Change Request 未承認 → deny: `CHANGE_UNAPPROVED`
3. トレーサビリティ未同期 → deny: `TRACEABILITY_MISSING`

**多重起動防止**: task_id + decision_id キーで同一判定の重複実行を抑止

### 4.3 uat-trigger.json

**Trigger**: PostToolUse（Deep Review 完了後）

**責務**: UAT 起動条件の注入のみを担当（FR-26）

**処理**: review-report.md が承認判定を持つことを確認し、uat_pending フラグを注入

---

## 5. 状態管理ポリシー

### 5.1 工程フェーズ

```
phase_sequence = [
  "requirement_analysis",
  "requirement_definition",
  "specification",
  "delivery_planning",
  "design",
  "implementation",
  "fast_review",
  "deep_review",
  "uat",
  "complete"
]
```

**遷移方向**: 一方向のみ。出戻りは出戻り先工程まで全フェーズを逆戻りさせる

### 5.2 意思決定状態

```
decision_state = "pending" | "recorded" | "postponed" | "suspended"
```

**SLA**:
- pending の default SLA: 4 時間
- 4 時間超過: 催促通知
- 24 時間超過: suspended 遷移

### 5.3 サーキットブレーカ状態

```
breaker_state = "closed" | "open" | "half_open"
```

**closed**: 正常、外部依存呼び出し可  
**open**: 障害確定、呼び出し停止（ローカル処理のみ継続）  
**half_open**: 試行中、復旧判定中

### 5.4 タスク完了条件

```
task_complete = (
  all_phases_complete AND
  hard_drift == 0 AND
  episode_written == true AND
  audit_log_complete == true
)
```

---

## 6. コスト管理・ガードレール

### 6.1 予算警告閾値

```
predicted_cost = planned_user_prompts × selected_model_multiplier
alert_threshold = 0.80 × remaining_budget

if predicted_cost >= alert_threshold:
  → warn and apply cost guard
```

### 6.2 降格順序

1. Deep Review を無効化
2. 並列レビューを無効化
3. 低コストモデルへ切替
4. 最小結果レスポンスを返却

---

## 7. 複雑度判定ルール

タスク複雑度は **変更行数のみではなく**、以下を総合判定：

- 変更行数
- 変更ファイル数
- ユーザー要求の性質（簡易修正 vs 大規模開発）
- 影響範囲
- 必要な検討観点

**計測バケット** (KPI計測参考値):
- **Simple**: 変更行数 < 80 かつ変更ファイル数 ≤ 2
- **Medium**: 変更行数 80-300 または変更ファイル数 3-5
- **Complex**: 変更行数 > 300 または変更ファイル数 ≥ 6

---

## 8. 重大リスク領域（必須Deep Review対象）

Deep Review は最低限以下を検査しなければなりません：

- **Authentication/Authorization**: 認証・認可ロジック
- **Secrets/Credentials**: 秘密情報・APIキー
- **Payment/Billing**: 課金・決済関連
- **Data Integrity/Persistence**: データ整合性・状態遷移
- **External Dependencies**: 重要な外部連携

---

## 9. 運用規約

### 9.1 日次確認（OR-08）

毎日以下を確認します：

- 失敗タスク件数
- 手動引き継ぎ件数
- 予算警告件数

是正必須閾値（前日比 +20%）超過時は当日中に暫定対応

### 9.2 週次ガバナンス（OR-03）

週 1 回以下を確認し、必要に応じて調整：

- リードタイム（p50 / p90）
- premium request 消費量
- drift 発生率  
- 再試行・フォールバック率

---

## 10. ファイルアクセス規約

### 10.1 読み取り

- **state/**: Coordinator・各エージェントが読み取り可能
- **memory/**: Memory Retriever が読み取り＆搭載制御
- **audit_log/**: 読み取り可能（追記のみ）

### 10.2 書き込み

- **state/**: Coordinator のみが更新権を持つ（Hook 経由の自動更新も含む）
- **audit_log/**: append-only。Hooks・イベント層が追記
- **memory/**: Episode Writer・Distillation Worker が更新

---

## 11. 外部ツール・API ポリシー

### 11.1 MCP サーバー

- ファイルシステムアクセス（ローカル）
- GitHub Issues 連携（任意、feature flag 制御）
- CI/CD 結果取得（任意）

**フォールバック**: MCP 不可時もローカル処理で継続

### 11.2 fetch ツール

- 機能調査時のみ利用
- 最大 8 分（高リスク変更は 12 分まで拡張可）
- 焦点化クエリ最大 6 件
- 出典マスキング方針を遵守

---

## 12. 実装フェーズのマイルストーン

### Phase 1 (Week 0-4): 最小構成

| Week | 完了条件 |
|------|----------|
| 0 | baseline-metrics を固定、state/ 初期化、Workspace Instructions 確定 |
| 1 | Coordinator + Request Analyzer が稼働、3つ以上の known_pattern タスク実行 |
| 2 | Audit Logger Hook 有効化、events.jsonl 記録確認、欠損イベント 0 件 |
| 3 | Episode Writer 有効化、hard drift 未解消タスクの episode 記録ブロック確認 |
| 4 | Cost Guard + Artifact Gate 有効化、予算警告機構が動作確認 |

### Phase 2 (Week 5-8): 強化

- Deep Review / Governance / UAT Runner 有効化
- Memory Retriever + Tiered Memory 完全運用
- Decision Gate + Handoffs による意思決定フロー

### Phase 3 (Week 9+): 最適化

- Distillation Worker 有効化
- セマンティックハッシュキャッシュ精度改善
- 週次ガバナンス Prompt の定型化

---

## 13. 緊急時の対応

### 13.1 タイムアウト時

1. 回数上限付き指数バックオフ再試行（最大 2 回）
2. 直列モードへフォールバック
3. status, completed_steps, blocked_steps, recommended_next_action を含む最小結果レスポンスを返却

### 13.2 外部依存障害時

- breaker_state を open に遷移
- ローカル処理優先で継続
- 必須チェックは継続、任意チェック（外部依存）は deferred 記録

### 13.3 予算超過時

- 降格順序に従い段階的に機能を制限
- ユーザーに警告・最小結果を返却
- 週次ガバナンスで改善策を確認

---

**本 Workspace Instructions は Phase 1 Week 0 で確定します。Week 1 以降、必要に応じて段階的に更新します。**

---

## 14. スキルシステム (Super Skills)

This workspace uses shared skills from `skills/` and generated GitHub Copilot artifacts from `.github/skills/`.

Apply these defaults in chat and agent mode:

- Treat `skills/` as the authored source of truth.
- Treat `.github/skills/` as generated output for GitHub Copilot discovery.
- Prefer the custom agents in `.github/agents/` for exploration, review, and documentation lookup tasks.
- Keep edits explicit, avoid hidden automation, and prefer the smallest safe change set.
- Do not add host-specific frontmatter or VS Code-only metadata to `skills/`.
- Keep research, browser, and external-tool usage opt-in.

When a task maps to an existing skill, load that skill before improvising a new workflow.