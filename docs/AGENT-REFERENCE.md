# カスタムエージェント リファレンス

**目的**: `.github/agents/` に定義されている 18 個のカスタムエージェントの役割・インターフェース・実行条件を一覧化し、システム全体の動作を明確にする。  
**最終更新**: 2025-07-17  
**対応フェーズ**: Phase 1 (Week 0–4 稼働) / Phase 2 (Week 5+ 有効化) を区別して記載。

---

## 1. エージェント一覧

| # | エージェント名 | ファイル | ユーザー起動 | フェーズ | 主モデル | ツール |
|---|----------------|----------|:----------:|:-------:|---------|--------|
| 1 | Coordinator | `coordinator.agent.md` | ✅ | Phase 1 | GPT-4.1, GPT-5 mini | read, edit, search, agent, fetch |
| 2 | Request Analyzer | `request-analyzer.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search, fetch |
| 3 | Planner | `planner.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search, edit |
| 4 | Implementer | `implementer.agent.md` | ❌ | Phase 1 | GPT-5.3-Codex, GPT-4.1, GPT-5 mini | read, edit, search, fetch |
| 5 | Fast Gate | `fast-gate.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search |
| 6 | Deep Review | `deep-review.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini, Claude Sonnet 4.6 | read, search, fetch |
| 7 | Episode Writer | `episode-writer.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, edit, search |
| 8 | Memory Retriever | `memory-retriever.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search |
| 9 | Governance | `governance.agent.md` | ❌ | **Phase 2** | GPT-4.1, GPT-5 mini | read, edit, search |
| 10 | UAT Runner | `uat-runner.agent.md` | ❌ | **Phase 2** | GPT-4.1, GPT-5 mini, Claude Sonnet 4.6 | read, edit, search |
| 11 | Decision Gate | `decision-gate.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, edit |
| 12 | Distillation Worker | `distillation-worker.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, edit, search |
| 13 | Feasibility Review | `feasibility-review.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search |
| 14 | Flow Review | `flow-review.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search |
| 15 | Scope Review | `scope-review.agent.md` | ❌ | Phase 1 | GPT-4.1, GPT-5 mini | read, search |
| 16 | Explorer | `explorer.agent.md` | ❌ | Phase 1 | GPT-4.1 | read, search |
| 17 | Reviewer | `reviewer.agent.md` | ❌ | Phase 1 | GPT-4.1, Claude Sonnet 4.6 | read, search |
| 18 | Docs Researcher | `docs-researcher.agent.md` | ❌ | Phase 1 | GPT-4.1 | read, search, fetch |

---

## 2. ワークフロー概要

### 2.1 フェーズシーケンス

```
[ユーザー] → Coordinator
                │
                ├─ Request Analyzer  ← 要求分類・task_contract 生成
                │
                ├─ Planner           ← 実装ステップ分解・セマンティックキャッシュ
                │
                ├─ Implementer       ← コード実装（60s タイムアウト）
                │
                ├─ Fast Gate         ← 重大リスク高速チェック（20s）
                │    └─ 要Deep Review? ─────────────────┐
                │                                       ↓
                ├─ Deep Review                   詳細レビュー（60s）
                │
                ├─ [Phase 2] UAT Runner          受け入れテスト
                │
                ├─ Episode Writer    ← タスク完了記録
                │
                └─ Distillation Worker  ← 知識蒸留（しきい値到達時）
```

### 2.2 サポートエージェントの呼び出しタイミング

| エージェント | 呼び出しタイミング |
|------------|----------------|
| Memory Retriever | タスク開始前（Tier-1 Core ロード） |
| Decision Gate | 複数案が存在し、ユーザー選択が必要な場合 |
| Governance | Phase 2：トレーサビリティ同期・CR 承認（リリース判定前） |
| Feasibility Review / Flow Review / Scope Review | 文書レビュー依頼時 |
| Explorer | Coordinator・Implementer が詳細探索を委譲する時 |
| Reviewer | Deep Review の補助・コードレビュー依頼時 |
| Docs Researcher | 一次情報の確認が必要な時 |

---

## 3. エージェント詳細

---

### 3.1 Coordinator

**ファイル**: [.github/agents/coordinator.agent.md](../.github/agents/coordinator.agent.md)  
**役割**: 全体オーケストレーター。工程順序の強制、成果物整合確認、サブエージェント呼び出し制御を担う。唯一`user-invocable: true`のエージェント。

#### 主な責務
1. `state/current_task.json` の読み書き（工程状態管理）
2. フェーズシーケンス (`requirement_analysis` → `complete`) の一方向遷移制御
3. 各工程の成果物更新確認（artifact-gate Hook との連携）
4. サブエージェント（14体）への委譲と結果統合
5. Memory Retriever・Governance 処理の委譲

#### Sub-agents リスト（14体）
Request Analyzer / Planner / Implementer / Fast Gate / Deep Review / Governance / UAT Runner / Episode Writer / Memory Retriever / Distillation Worker / Decision Gate / Feasibility Review / Flow Review / Scope Review

#### Handoffs
- `decision-gate` ← 複数案が発生した場合
- `episode-writer` ← タスク完了時

---

### 3.2 Request Analyzer

**ファイル**: [.github/agents/request-analyzer.agent.md](../.github/agents/request-analyzer.agent.md)  
**役割**: ユーザー要求を解析・分類し、標準化された `task_contract` JSON を生成。

#### 分類結果

| 分類 | 意味 | 次アクション |
|------|------|------------|
| `known_pattern` | 既知パターンに一致 | Planner キャッシュを照合し実行 |
| `new_required_capability` | 新機能・新規実装が必要 | Planner で新規計画生成 |
| `ambiguous_request` | 要求が不明確 | ユーザーに追加確認を求める |

#### task_contract スキーマ（出力）
```json
{
  "task_id": "UUID",
  "title": "タスク名",
  "category": "known_pattern | new_required_capability | ambiguous_request",
  "complexity_class": "simple | medium | complex",
  "goal": "実現する成果物",
  "constraints": ["制約リスト"],
  "done_criteria": ["完了条件"],
  "out_of_scope": ["スコープ外"],
  "acceptance_tests": ["受け入れテストシナリオ"],
  "source_ur_id": "UR-XX",
  "mapped_br_id": "BR-XX"
}
```

---

### 3.3 Planner

**ファイル**: [.github/agents/planner.agent.md](../.github/agents/planner.agent.md)  
**役割**: `task_contract` を実装ステップに分解し、依存関係と実行順序を定義。セマンティックハッシュによるキャッシュ再利用をサポート。

#### マイルストーン分解（M1–M5）

| マイルストーン | 内容 |
|-------------|------|
| M1 | 要件確定・成果物リスト作成 |
| M2 | アーキテクチャ・設計決定 |
| M3 | コア実装（最小動作） |
| M4 | テスト・レビュー |
| M5 | 完了・記録 |

#### キャッシュ制御スキーマ
```json
{
  "cache_key": "semantic_hash of task_contract",
  "ttl_hours": 24,
  "complexity_class": "simple | medium | complex",
  "milestones": [],
  "steps": []
}
```
- セマンティックハッシュが一致し TTL 内の場合は既存キャッシュを再利用
- キャッシュファイルは `cache/planner/` に保存

---

### 3.4 Implementer

**ファイル**: [.github/agents/implementer.agent.md](../.github/agents/implementer.agent.md)  
**役割**: Planner の計画に従い実際のコード実装を実行。60 秒タイムアウト管理とフォールバック応答を持つ。

#### タイムアウト処理
1. 1 回目失敗 → 指数バックオフ再試行（最大 2 回）
2. 2 回失敗 → 直列モードへフォールバック
3. タイムアウト確定 → 最小結果レスポンスを返却

#### 最小結果レスポンス（timeout 時の出力）
```json
{
  "status": "timeout",
  "completed_steps": ["完了済みステップ"],
  "blocked_steps": ["ブロックされたステップ"],
  "recommended_next_action": "次のアクション"
}
```

---

### 3.5 Fast Gate

**ファイル**: [.github/agents/fast-gate.agent.md](../.github/agents/fast-gate.agent.md)  
**役割**: 実装後の高速リスクチェック（20 秒以内）。5 つのチェック項目を評価し、Deep Review の要否を判定。

#### チェック項目（C1–C5）

| チェック | 対象領域 |
|---------|---------|
| C1 | 認証・認可ロジック |
| C2 | シークレット・APIキー露出 |
| C3 | 課金・決済処理 |
| C4 | データ整合性・状態遷移 |
| C5 | 重要な外部依存 |

#### 判定
- **pass** → Episode Writer へ続行
- **Deep Review 必要** → Deep Review へ転送
- **critical block** → 実装フェーズへ差し戻し

---

### 3.6 Deep Review

**ファイル**: [.github/agents/deep-review.agent.md](../.github/agents/deep-review.agent.md)  
**役割**: 詳細レビュー（60 秒）。Fast Gate で要 Deep Review と判定された変更を精査。Circuit Breaker と統合。

#### 必須チェック
- Authentication / Authorization の正確性
- Secrets / Credentials の露出なし
- Payment / Billing の処理正確性
- Data Integrity / 状態遷移の完全性
- External Dependencies の信頼性

#### 任意チェック（外部依存）
- CI/CD 結果検証
- 外部 API の動作確認
- 外部依存が落ちている場合 → `deferred` で記録、ブロックしない

#### 判定結果
- `approved` → Episode Writer へ
- `conditional_approved` → 条件付き承認（改善項目あり）
- `rejected` → 実装フェーズへ差し戻し

---

### 3.7 Episode Writer

**ファイル**: [.github/agents/episode-writer.agent.md](../.github/agents/episode-writer.agent.md)  
**役割**: タスク完了時に `memory/episodes/<task_id>.md` を生成。タスクの知識を蓄積し、将来の再利用を支援。

#### 記録禁止条件（Block）
- `hard_drift` が未解消のタスク
- 出戻り後（upstream 工程再実行後）のタスク
- レビュー結果が `rejected` のタスク

#### Episode テンプレート
```markdown
# Episode: <task_id>

## task_contract
[task_contract JSONの抜粋]

## 採用した解決策
[採用した実装アプローチ]

## Drift 記録
[当初計画からの逸脱とその理由]

## レビュー結果
[Fast Gate / Deep Review の最終判定]

## 学習事項
[次回の同種タスクへの知見]
```

---

### 3.8 Memory Retriever

**ファイル**: [.github/agents/memory-retriever.agent.md](../.github/agents/memory-retriever.agent.md)  
**役割**: Tiered Memory（3 段階）から効率的に記憶を取得。コンテキスト予算を管理し、関連度の高い知識のみをロード。

#### Tier 構造

| Tier | ファイル | ロード方針 |
|------|---------|-----------|
| Tier 1 Core | `memory/core.md` | 常時ロード（2000 トークン以内） |
| Tier 2 Patterns | `memory/patterns/*.md` | セマンティック関連度 上位 N 件のみ |
| Tier 3 Episodes | `memory/episodes/*.md` | キーワード一致時のみ |

#### ハイブリッド検索ロジック
1. Tier 1 を必ずロード
2. task_contract のキーワードで Tier 2 を意味的に検索
3. Tier 2 ヒットなし → Tier 3 をキーワードマッチで補完
4. 合計トークン数が予算超過 → Tier 3 を切り捨て

---

### 3.9 Governance ⚠️ Phase 2

**ファイル**: [.github/agents/governance.agent.md](../.github/agents/governance.agent.md)  
**役割**: トレーサビリティ同期（FR-25）と Change Request 処理（FR-27）を統合管理。Week 5+ に有効化。

#### Deny コード（リリースブロック）

| コード | 原因 |
|--------|------|
| `PHASE_GATE_FAIL` | 工程順序違反 |
| `CHANGE_UNAPPROVED` | Change Request 未承認 |
| `TRACEABILITY_MISSING` | UR → BR → FR → AC → 証跡 の不整合 |

#### トレーサビリティチェーン
```
source_ur_id → BR にマッピング有?
  ↓
BR → FR/NFR に反映有?
  ↓
FR → validation_ac_id が存在?
  ↓
AC → review-report に証跡有?
  ↓
すべて OK → 承認 / 1つでも欠落 → TRACEABILITY_MISSING
```

#### Change Request ライフサイクル
```
issue_detected → change_request.create (pending)
  → impact_analysis → approval_gate
    → approved: 変更反映 → final_review
    → rejected: 記録・説明
    → deferred: 別 CR 分割
```

---

### 3.10 UAT Runner ⚠️ Phase 2

**ファイル**: [.github/agents/uat-runner.agent.md](../.github/agents/uat-runner.agent.md)  
**役割**: 受け入れテスト実施（FR-26）。複雑度別の代表シナリオを実行し、pass / fail / conditional_pass を記録。Week 5+ に有効化。

#### 複雑度別シナリオ数

| 複雑度 | シナリオ | 内容 |
|--------|---------|------|
| Simple | 1–2 件 | 基本的な使用例（Happy Path） |
| Medium | 2–3 件 | 基本 + 統合シナリオ（複数モジュール） |
| Complex | 3–4 件 | 基本 + 統合 + 異常系・境界値 |

#### 判定
- `pass` → 全シナリオ合格
- `fail` → 重大失敗あり（`rollback_target` フェーズを明示）
- `conditional_pass` → 軽微な警告のみ（ユーザー確認で受け入れ可否判定）

---

### 3.11 Decision Gate

**ファイル**: [.github/agents/decision-gate.agent.md](../.github/agents/decision-gate.agent.md)  
**役割**: ユーザー意思決定のゲート管理（FR-12）。複数案を提示し、SLA 内の決定を促す。

#### Decision State 遷移

| 状態 | 説明 | 遷移先 |
|------|------|--------|
| `pending` | 決定待ち（初期状態） | `recorded` / `postponed` / `suspended` |
| `recorded` | 決定済み | Coordinator が工程継続 |
| `postponed` | ユーザーが保留を明示 | `pending`（再催促） |
| `suspended` | 24 時間 SLA 超過 | 週次ガバナンス対象 |

#### SLA
- **4 時間超過** → 催促通知送信
- **24 時間超過** → `suspended` 遷移、週次ガバナンス対象化

#### 案提示テンプレート
```
オプション A / B について以下を比較提示:
  - 技術アプローチ
  - メリット・デメリット
  - リスクレベル（low / medium / high）
  - 遅延影響（分）
  - コスト（premium requests 数）
```

---

### 3.12 Distillation Worker

**ファイル**: [.github/agents/distillation-worker.agent.md](../.github/agents/distillation-worker.agent.md)  
**役割**: `memory/episodes/` が累積しきい値（デフォルト 20 件）に達した際、知識を `memory/patterns/` へ蒸留し `memory/archive/` へ移送。

#### 処理フロー
1. `memory/episodes/` から対象 episode を収集
2. 重複学習を統合して `memory/patterns/*.md` を更新
3. 蒸留済み episode を `memory/archive/` へ移動
4. 件数・変更点を返却

#### ガード条件
- `hard_drift` 未解消タスク由来 episode → 蒸留対象外
- 監査証跡が欠落している episode → skip
- 変更なし → `status: skipped` で終了

---

### 3.13 Feasibility Review

**ファイル**: [.github/agents/feasibility-review.agent.md](../.github/agents/feasibility-review.agent.md)  
**役割**: 要件・設計文書の実装可能性レビュー。非現実的な前提・未解決の依存関係・検証不可能な受け入れ基準を検出。

#### アプローチ
1. 非現実的なシーケンス・根拠なし仮定・検証不可能な主張を検査
2. 受け入れ条件・ロールアウト・運用制約の実装可能性を確認
3. 高価値の指摘と対象文書への具体的な修正案のみを返却

#### 出力フォーマット
- **Summary**: 2–4 行の概要
- **Findings**: severity / 対象ファイル・セクション / 問題 / 理由
- **Recommended fixes**: 簡潔な文書レベルアクション

---

### 3.14 Flow Review

**ファイル**: [.github/agents/flow-review.agent.md](../.github/agents/flow-review.agent.md)  
**役割**: 開発ライフサイクルフローと文書整合性レビュー。工程順序・成果物ハンドオフ・逆戻りルールの曖昧さを検出。

#### アプローチ
1. 要求→完了までのライフサイクルをトレース
2. 成果物の作成・更新ゲート・上流復帰ルールを検証
3. 要件・仕様・設計・フロー文書間の矛盾を検出

#### スコープ外
- 実装アルゴリズム
- 見た目のみの編集

---

### 3.15 Scope Review

**ファイル**: [.github/agents/scope-review.agent.md](../.github/agents/scope-review.agent.md)  
**役割**: 製品・システム文書のスコープ・優先度レビュー。不足機能・スコープクリープ・フェーズ不適切な詳細を検出。

#### アプローチ
1. 運用完全性のために不足している機能を特定
2. 現在のフェーズに対して時期尚早・重複・詳細過ぎる機能を特定
3. 追加・延期・削除を根拠付きで推薦

#### スコープ外
- 文体のみの最適化
- 具体的なギャップ閉鎖目的以外の新機能追加

---

### 3.16 Explorer

**ファイル**: [.github/agents/explorer.agent.md](../.github/agents/explorer.agent.md)  
**役割**: 読み取り専用のコードベース探索サブエージェント。複数の検索・ファイル読み込み操作を代行し、メイン会話を汚さない。並列実行安全。

#### 使用方針
- **thoroughness 指定**: `quick` / `medium` / `thorough` を呼び出し時に明示
- 実際の実行パスをトレースし、ファイル・シンボルを正確に引用
- 広範スキャンより目標を絞った読み込み・検索を優先
- **編集提案不可**（親タスクが明示要求した場合を除く）

---

### 3.17 Reviewer

**ファイル**: [.github/agents/reviewer.agent.md](../.github/agents/reviewer.agent.md)  
**役割**: 所有者視点の指摘優先コードレビュー。正確性・回帰・セキュリティリスク・テスト漏れを優先検査。

#### レビュー優先順位
1. 正確性・動作回帰
2. セキュリティリスク
3. テスト漏れ
4. スタイル（実際の欠陥を隠す場合のみ）

---

### 3.18 Docs Researcher

**ファイル**: [.github/agents/docs-researcher.agent.md](../.github/agents/docs-researcher.agent.md)  
**役割**: 一次情報源に対するドキュメント検証。実装前に主張を公式ドキュメント・リリースノートで裏付ける。

#### 使用方針
- 公式ドキュメント・リリースノートを二次情報まとめより優先
- 根拠となる正確なドキュメント・設定ファイル・リリースノートを引用
- 文書化されていない動作を創作禁止（`fetch` ツールで一次確認を行う）

---

## 4. 横断的関心事

### 4.1 コスト管理・モデル降格順序

予算警告閾値（`remaining_budget × 0.80`）超過時の降格：

1. Deep Review を無効化
2. 並列レビューを無効化
3. 低コストモデル（GPT-5 mini）へ切替
4. 最小結果レスポンスのみ返却

### 4.2 サーキットブレーカー

| 状態 | 意味 | 動作 |
|------|------|------|
| `closed` | 正常 | 外部依存呼び出し可能 |
| `open` | 障害確定 | 呼び出し停止、ローカル処理継続 |
| `half_open` | 試行中 | 復旧判定中 |

外部依存が `open` 状態でも必須チェックは継続。任意チェックは `deferred` で記録。

### 4.3 Hook との連携

| Hook | トリガー | 担当 |
|------|---------|------|
| `artifact-gate` | PreToolUse（工程遷移時） | 成果物更新整合確認 |
| `audit-logger` | 全イベント | `audit_log/events.jsonl` への記録 |
| `cost-guard` | PreToolUse | 予算警告・降格制御 |
| `governance-gate` | PreToolUse（release 判定時） | 承認状態・トレーサビリティ統合判定 |
| `phase-transition-guard` | PreToolUse（フェーズ遷移時） | 工程順序一方向性の強制 |
| `uat-trigger` | PostToolUse（Deep Review 完了後） | UAT 起動条件注入 |

### 4.4 タスク完了条件

```
task_complete = (
  all_phases_complete AND
  hard_drift == 0 AND
  episode_written == true AND
  audit_log_complete == true
)
```

### 4.5 状態ファイル

| ファイル | 書き込み権限 | 内容 |
|---------|------------|------|
| `state/current_task.json` | Coordinator のみ | 現在のタスク・工程・予算状態 |
| `state/budget_state.json` | Coordinator のみ | premium request 残高・警告状態 |
| `audit_log/events.jsonl` | Hooks・イベント層（append-only） | 全イベントログ |
| `memory/core.md` | Episode Writer・Distillation Worker | Tier-1 Core 知識 |

---

## 5. フェーズ別有効化状態

| フェーズ | 有効エージェント |
|---------|---------------|
| **Phase 1** (Week 0–4) | Coordinator, Request Analyzer, Planner, Implementer, Fast Gate, Deep Review, Episode Writer, Memory Retriever, Decision Gate, Distillation Worker, Feasibility Review, Flow Review, Scope Review, Explorer, Reviewer, Docs Researcher |
| **Phase 2** (Week 5+) | ＋ Governance, ＋ UAT Runner |

---

## 6. 次アクション

- [x] Phase 2 有効化（Week 5）: `governance.agent.md` / `uat-runner.agent.md` の定義確認、Hook 統合テスト実行、`state/*.json` の phase_stage を更新（2026-04-05）
- [x] `memory/core.md` の Tier-1 Core 内容を 2000 トークン以内に維持（確認値: 約 1257 tokens）
- [ ] `episodes/` が 20 件超過したら Distillation Worker を手動起動（現状: 1 件）
- [x] 週次ガバナンスで `decision_state = suspended` のタスクを確認（現状: 該当なし）

---

*本文書は `state/current_task.json` および `.github/agents/` の変更に合わせて更新する。*
