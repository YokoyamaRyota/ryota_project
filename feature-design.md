# VS Code Copilot 機能設計書

## 0. 設計前提と調査結果

### 0.1 対象 Copilot プリミティブ（2026年4月時点最新）

| プリミティブ | ファイル形式・場所 | 主要用途 |
|------------|-----------------|--------|
| Workspace Instructions | `.github/copilot-instructions.md` | 常時適用・プロジェクト規約 |
| File Instructions | `.github/instructions/*.instructions.md` | ファイル種別スコープ指示 |
| Custom Agents | `.github/agents/*.agent.md` | 役割特化エージェント・ツール制限 |
| Subagents | `runSubagent` ツール経由 | コンテキスト分離・並列実行 |
| Hooks (Preview) | `.github/hooks/*.json` | ライフサイクル時点の確定的シェル実行 |
| MCP Servers | `.vscode/mcp.json` | 外部ツール・API統合 |
| Prompt Files | `.github/prompts/*.prompt.md` | 入力パラメータ付き単発タスク |
| Agent Skills | `.github/skills/<name>/SKILL.md` | スクリプト同梱の再利用ワークフロー |
| Handoffs | `.agent.md` frontmatter の `handoffs` フィールド | エージェント間遷移のガイド UI |

### 0.2 重要な実現可能性制約（要件定義への影響あり）

以下の制約は設計全体に影響する。上流への出戻り判断を伴うものは [§6 実現困難・制約報告](#6-実現困難制約報告上流出戻り検討) に詳述する。

| 制約ID | 内容 | 影響要件 |
|--------|------|--------|
| C-01 | Copilot のプレミアムリクエスト使用量はシステム側から **プログラム的に取得・監視できない**。GitHub UI/API による事後確認のみ。 | FR-05, KPI-2, NFR-02 |
| C-02 | サブエージェントは**同期的・直接呼び出し**のみ。`runSubagent` は1ユーザープロンプト内で複数並列呼び出しを LLM に委任するが、プラットフォーム側の真の並列保証はない。 | FR-03 |
| C-03 | Hooks は **Preview** 機能であり、設定フォーマットや挙動が今後変更される可能性がある。 | BR-03, FR-19 |
| C-04 | モデルルーティング（`model` フィールド）は `.agent.md` の frontmatter で静的または優先リスト指定のみ。**動的かつプログラム的なモデル切替**は LLM 指示ベースの判断。 | FR-04, FR-05 |
| C-05 | セマンティックハッシュキャッシュは VS Code Copilot に**組み込みキャッシュ機構が存在しない**。ワークスペース内のファイルベースキャッシュで代替実装する必要がある。 | FR-14 |
| C-06 | `suspended` 状態など、複雑なステート機械の**厳密なランタイム強制**は Hooks + ファイルベース状態管理の組み合わせで部分的にしか実現できない。 | FR-13d, FR-24 |

---

## 1. アーキテクチャ設計方針

### 1.1 プリミティブ選択方針

```
役割ベース分離    → Custom Agents (.agent.md)
段階的ワークフロー  → Handoffs (frontmatter)
確定的制御・監査   → Hooks (.github/hooks/*.json) [Preview]
外部ツール統合    → MCP Servers (.vscode/mcp.json)
コア知識・規約    → Workspace Instructions + File Instructions
再利用ワークフロー  → Agent Skills (.github/skills/)
ステート・成果物   → ワークスペースファイル (memory/, audit_log/, etc.)
```

### 1.2 全体ファイル構成

```
.github/
  copilot-instructions.md          # ワークスペース共通指示
  agents/
    coordinator.agent.md           # Coordinator (オーケストレーター)
    planner.agent.md               # Planner
    implementer.agent.md           # Implementer
    fast-gate.agent.md             # Fast Gate Reviewer
    deep-review.agent.md           # Deep Review Reviewer
    governance.agent.md            # Governance（Traceability + Change Request）
    uat-runner.agent.md            # UAT Runner
    episode-writer.agent.md        # Episode Writer (subagent専用)
    memory-retriever.agent.md      # Memory Retriever (subagent専用)
    distillation-worker.agent.md   # Distillation Worker (subagent専用)
    request-analyzer.agent.md      # Request Analyzer (subagent専用)
    decision-gate.agent.md         # Decision Gate (subagent専用)
  prompts/
    new-task.prompt.md             # 新規タスク起動テンプレート
    resume-task.prompt.md          # タスク再開テンプレート
    weekly-governance.prompt.md    # 週次ガバナンス実行
    baseline-measure.prompt.md     # ベースライン計測
  hooks/
    audit-logger.json              # 全ツール呼び出し監査ログ
    artifact-gate.json             # 成果物更新ゲート (PreToolUse)
    phase-transition-guard.json    # 工程順序ガード (PreToolUse)
    cost-guard.json                # コストガードレール注入 (SessionStart)
    decision-gate-sla.json         # Decision SLA 監視 (SessionStart)
    episode-writer-trigger.json    # タスク完了時エピソード記録 (Stop)
    governance-gate.json           # 承認/トレーサビリティの統合ゲート
    uat-trigger.json               # レビュー後 UAT 起動トリガー
  skills/
    memory-distillation/
      SKILL.md
    baseline-metrics/
      SKILL.md
  instructions/
    markdown-artifact.instructions.md  # .md 成果物ファイル規約 (applyTo: "*.md")
    audit-log.instructions.md          # audit_log/ 書式規約
.vscode/
  mcp.json                        # MCP サーバー設定 (任意: GitHub Issues, filesystem 等)
memory/
  core.md                         # Tier-1 Core (常時ロード)
  patterns/
    known_patterns.md
    failure_modes.md
  episodes/                       # Tier-3 Episodes
  archive/                        # Tier-4 Archive
  index.json                      # メモリ索引
audit_log/
  events.jsonl                    # append-only JSONL イベントログ
cache/
  planner/                        # Planner フェーズ結果キャッシュ
  reviewer/                       # Reviewer フェーズ結果キャッシュ
state/
  current_task.json               # 現行タスク状態
  budget_state.json               # コスト状態 (人手管理)
requirements-definition.md
system-specification.md
delivery-plan.md
design.md
review-report.md
```

---

## 2. カスタムエージェント設計

### 2.1 Coordinator エージェント

**ファイル**: `.github/agents/coordinator.agent.md`

```yaml
---
name: Coordinator
description: "Use when: starting a new development task, resuming a task, or orchestrating the full workflow from request analysis to review completion."
model:
  - GPT-4.1 (copilot)         # 同一 multiplier の included モデル内で高性能側を優先
  - GPT-5 mini (copilot)
tools:
  - read
  - edit
  - search
  - agent
  - fetch
agents:
  - Request Analyzer
  - Planner
  - Implementer
  - Fast Gate
  - Deep Review
  - Governance
  - UAT Runner
  - Episode Writer
  - Memory Retriever
  - Distillation Worker
  - Decision Gate
handoffs:
  - label: "タスク完了・ガバナンスレビュー"
    agent: coordinator
    prompt: "直近タスクの完了を確認し、週次ガバナンスが必要か判断してください。"
    send: false
---
```

**Instructions 本文（抜粋）**:
- `state/current_task.json` から現在の工程フェーズと予算状態を読み込む
- 工程順序 (FR-13d): 要求定義 → 要件定義 → デリバリープラン → 設計 → 実装 → レビュー の順を厳守
- 各工程の成果物更新が確認されるまで次工程へ進まない (FR-13e)
- 追加情報・意思決定・明示的承認が不要な場合は自動進行 (FR-13c)
- Memory Retriever サブエージェントでコア記憶をロードしてからワークフロー開始
- ガバナンス処理は Governance に委譲し、Coordinator は判断実行の順序制御のみを担当する

### 2.2 Request Analyzer エージェント

**ファイル**: `.github/agents/request-analyzer.agent.md`

```yaml
---
name: Request Analyzer
description: "要求解析・分類専用サブエージェント。known_pattern / new_required_capability / ambiguous_request のトリアージを実施。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - search
---
```

**処理内容**:
- FR-01: goal / constraints / done_criteria / out_of_scope を抽出し、タスク契約JSONを `state/current_task.json` に出力
- FR-01a: `known_pattern` / `new_required_capability` / `ambiguous_request` に分類
- FR-01b: 分類理由をログに記録。known_pattern 適用条件（既知パターンID・must-have制約追加なし・high-risk非該当）を検証
- 高リスク領域 (auth / secrets / payment / integrity) のキーワードマッチ判定

### 2.3 Planner エージェント

**ファイル**: `.github/agents/planner.agent.md`

```yaml
---
name: Planner
description: "タスク分解・実行計画立案専用サブエージェント。キャッシュ確認を先行実施。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - search
---
```

**処理内容**:
- FR-14: `cache/planner/` でセマンティックハッシュを照合し、ヒット時は結果を返却 (`cache_hit=true` をログ記録)
- FR-02: ハンドオフ契約オブジェクトの必須項目 (goal / constraints / done_criteria / out_of_scope / acceptance_tests) を検証
- FR-03: 複雑度・変更ファイル数・変更行数から並列実行ポリシーを判定し、推奨並列上限を返却
- タイムアウト上限 15 秒 (OR-02) を遵守

### 2.4 Implementer エージェント

**ファイル**: `.github/agents/implementer.agent.md`

```yaml
---
name: Implementer
description: "コード実装・タスク実行専用エージェント。上流成果物が確定済みの場合のみ起動可。"
user-invocable: false
model:
  - GPT-5.3-Codex (copilot)   # agentic software development 推奨モデル優先
  - Claude Sonnet 4.6 (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
  - search
  - runCommands
---
```

**処理内容**:
- FR-13a: 実装開始前に requirements-definition.md / system-specification.md / delivery-plan.md / design.md の更新状態を検証
- タイムアウト上限 60 秒 (OR-02)
- 完了後、`state/current_task.json` に実装完了フラグと変更サマリを書き込む

### 2.5 Fast Gate エージェント

**ファイル**: `.github/agents/fast-gate.agent.md`

```yaml
---
name: Fast Gate
description: "高速レビューゲート。重大リスクのみチェック。FR-07 Stage 1 を担当。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - search
---
```

**チェック項目** (FR-07 Stage 1):
1. 必須ハンドオフ項目の存在と妥当性
2. must-have 制約の未違反確認
3. out-of-scope 拡張率 ≤ 30%
4. 明白な重大パターン（秘密情報漏洩・インジェクション兆候）の不在
5. acceptance tests のカバレッジ欠落なし

タイムアウト上限 20 秒 (OR-02)

### 2.6 Deep Review エージェント

**ファイル**: `.github/agents/deep-review.agent.md`

```yaml
---
name: Deep Review
description: "深掘りレビュー。Fast Gate で重大/高リスク検知時または高リスク領域を含む場合に起動。"
user-invocable: false
model:
  - Claude Sonnet 4.6 (copilot)   # multiplier=1、深掘りレビュー向け
  - GPT-5.2 (copilot)
tools:
  - read
  - search
  - fetch   # 外部依存チェック（breaker_state 参照後のみ使用）
---
```

**処理内容** (FR-07a):
- 必須チェック: ローカル静的レビュー + タスク契約整合性検証
- 任意チェック: 外部APIスキャン（`state/current_task.json` の `breaker_state` を確認後実行）
- `breaker_state=open` 時は外部チェックを `deferred` に記録し、必須チェックのみ継続
- タイムアウト上限 60 秒 (OR-02)

### 2.7 Episode Writer エージェント

**ファイル**: `.github/agents/episode-writer.agent.md`

```yaml
---
name: Episode Writer
description: "タスク完了時のエピソード記憶記録専用サブエージェント。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
---
```

**処理内容** (FR-15):
- hard drift が未解消のタスクは書き込み禁止
- 出戻り発生タスクや stale 成果物を含むタスクは `MEMORY_BLOCKED_ROLLED_BACK` イベントを記録して終了
- 正常時: `memory/episodes/<task-id>.md` に task_contract / 採用案 / drift / レビュー指摘を構造化記録

### 2.8 Memory Retriever エージェント

**ファイル**: `.github/agents/memory-retriever.agent.md`

```yaml
---
name: Memory Retriever
description: "Tiered Memory の検索・ロード制御専用サブエージェント。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - search
---
```

**処理内容** (FR-17):
- Tier-1 Core (`memory/core.md`) を常時ロード（目標 2,000 トークン以内）
- Tier-2 Patterns を関連度上位のみ取得
- 総メモリロード量が推定コンテキストウィンドウの 20% を超える場合、Tier-3 取得件数を自動削減
- known_pattern タスク: keyword 重みを上昇、new_capability タスク: semantic 重みを上昇

### 2.9 Decision Gate エージェント

**ファイル**: `.github/agents/decision-gate.agent.md`

```yaml
---
name: Decision Gate
description: "ユーザー意思決定ゲート専用サブエージェント。複数案提示・選択肢確認を担当。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
---
```

**処理内容** (FR-11, FR-12):
- 実現可能な実装案を最低2案提示（技術アプローチ / メリット / デメリット / リスクレベル / 遅延影響見積 / コスト影響見積 / 依存関係 / 運用複雑度 / ロールバック複雑度）
- `DECISION_GATE_OPENED` イベントを audit_log に記録
- 4時間タイムアウト後に催促通知、24時間超過で `suspended` 状態に遷移を Coordinator に通知
- ユーザー選択後: `DECISION_RECORDED` イベントを記録（selected_option / approver / timestamp）

### 2.10 Governance エージェント

**ファイル**: `.github/agents/governance.agent.md`

```yaml
---
name: Governance
description: "トレーサビリティ同期と Change Request 管理を統合して実施するガバナンス専用サブエージェント。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
  - search
---
```

**処理内容** (FR-25, FR-27):
- `source_ur_id / mapped_br_id / validation_ac_id / review_evidence_id` の整合検査
- Change Request の起票、影響分析、承認状態管理
- 不整合または未承認変更を検出した場合、release 判定をブロック
- 監査ログに判断根拠と差分影響範囲を記録

### 2.11 UAT Runner エージェント

**ファイル**: `.github/agents/uat-runner.agent.md`

```yaml
---
name: UAT Runner
description: "受け入れ判定専用。Simple / Medium / Complex の代表シナリオを実行し、判定を記録する。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
  - search
---
```

**処理内容** (FR-26):
- 複雑度別の代表シナリオを実行し、pass / fail / conditional-pass を記録
- fail の場合は出戻り先工程を明示
- `review-report.md` の UAT セクションを更新

### 2.12 Distillation Worker エージェント

**ファイル**: `.github/agents/distillation-worker.agent.md`

```yaml
---
name: Distillation Worker
description: "エピソード蒸留専用。episodes から再利用知識を抽出し、Tier-2 へ統合する。"
user-invocable: false
model:
  - GPT-5 mini (copilot)
  - GPT-4.1 (copilot)
tools:
  - read
  - edit
  - search
---
```

**処理内容** (FR-16):
- episodes を蒸留して再利用可能パターンを抽出
- Tier-2 / index を更新し、蒸留済みエピソードを archive へ移動
- 失敗時は episodes を保持し再実行可能性を維持

---

## 3. Hooks 設計

### 3.1 監査ロガー Hook

**ファイル**: `.github/hooks/audit-logger.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/log-event.js PreToolUse",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/log-event.js -ScriptArgs PreToolUse -FallbackMode silent",
        "timeout": 5
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/log-event.js PostToolUse",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/log-event.js -ScriptArgs PostToolUse -FallbackMode silent",
        "timeout": 5
      }
    ],
    "SessionStart": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/log-event.js SessionStart",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/log-event.js -ScriptArgs SessionStart -FallbackMode silent",
        "timeout": 5
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/log-event.js Stop",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/log-event.js -ScriptArgs Stop -FallbackMode silent",
        "timeout": 5
      }
    ]
  }
}
```

**スクリプト** (`.github/hooks/scripts/log-event.js`):
- stdin から共通フィールド（timestamp / cwd / sessionId / hookEventName / tool_name / tool_input）を読み込む
- `audit_log/events.jsonl` にイベントを JSONL 形式でアペンド
- 必須フィールド (FR-19a): event_id / timestamp_utc / event_type / actor_role / phase / task_id または decision_id / status / payload / correlation_id

### 3.2 コストガード注入 Hook

**ファイル**: `.github/hooks/cost-guard.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/inject-budget-context.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/inject-budget-context.js -FallbackMode context",
        "timeout": 5
      }
    ]
  }
}
```

**スクリプト処理**:
- `state/budget_state.json` を読み込み、残予算・警告フラグ・降格レベルを取得
- `hookSpecificOutput.additionalContext` として現在の予算状態文字列を注入
- これにより Coordinator エージェントが起動時から予算情報を把握できる

### 3.2a Decision SLA 監視 Hook

**ファイル**: `.github/hooks/decision-gate-sla.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/decision-gate-sla-check.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/decision-gate-sla-check.js -FallbackMode context",
        "timeout": 5
      }
    ]
  }
}
```

**スクリプト処理**:
- `state/current_task.json` の `decision_state` と `decision_started_at` を参照
- 4 時間超過時は `DECISION_REMINDER` を記録
- 24 時間超過時は `decision_state = suspended` として `DECISION_SUSPENDED` を記録

> **注記 (C-01)**: Copilot のプレミアムリクエスト使用量はプログラム的に取得不可。
> `state/budget_state.json` は **ユーザーが手動で更新するか、GitHub の使用量ページから取得した数値を入力する**ことを前提とする。
> Coordinator の指示の中で、タスクごとの推定消費量を計算・記録し、`state/budget_state.json` に書き込む手順を定義する。

### 3.3 成果物更新ゲート Hook

**ファイル**: `.github/hooks/artifact-gate.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/artifact-gate-check.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/artifact-gate-check.js -FallbackMode allow",
        "timeout": 10
      }
    ]
  }
}
```

**スクリプト処理** (FR-13e):
- 工程遷移要求の `next_phase` を解釈して判定する
- 対応成果物の存在、更新時刻、sync_status、must-have 項目を確認する
- 条件未達の場合: `permissionDecision: "deny"` を返却し、未充足項目を `permissionDecisionReason` に含める

### 3.4 エピソード記録トリガー Hook

**ファイル**: `.github/hooks/episode-writer-trigger.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/check-episode-trigger.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/check-episode-trigger.js -FallbackMode context",
        "timeout": 10
      }
    ]
  }
}
```

**スクリプト処理**:
- `state/current_task.json` のタスク完了フラグと `hard_drift_unresolved` フラグを確認
- タスク完了済みかつ hard_drift 未解消でない場合:  `hookSpecificOutput.decision: "block"` でセッション停止を抑制し、Episode Writer サブエージェントの起動を Coordinator に促す`reason` を返却
- `stop_hook_active` フラグを確認して無限ループを防止 (FR-15)

### 3.5 Governance 統合ゲート Hook

**ファイル**: `.github/hooks/governance-gate.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/governance-gate-check.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/governance-gate-check.js -FallbackMode allow",
        "timeout": 10
      }
    ]
  }
}
```

**スクリプト処理**:
- 判定順序を固定し、責務衝突を防ぐ。
  1) 工程ゲート違反（artifact_sync_status / phase mismatch）
  2) Change Request 未承認
  3) トレーサビリティ未同期
- いずれかに違反した場合は `permissionDecision: "deny"` を返却
- deny 理由は単一コード（`PHASE_GATE_FAIL` / `CHANGE_UNAPPROVED` / `TRACEABILITY_MISSING`）で返し、監査ログへ記録

### 3.6 UAT トリガー Hook

**ファイル**: `.github/hooks/uat-trigger.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/trigger-uat.js",
        "windows": "powershell -NoProfile -ExecutionPolicy Bypass -File .github/hooks/scripts/run-node-hook.ps1 -Script .github/hooks/scripts/trigger-uat.js -FallbackMode context",
        "timeout": 10
      }
    ]
  }
}
```

**スクリプト処理**:
- レビュー完了イベント検知時にのみ UAT Runner 起動コンテキストを注入
- `task_id + decision_id` の重複キーで同一UATの多重起動を防止
- UAT 未実施の release 操作は Governance Hook によりブロック可能とする

### 3.7 Hook 責務境界（重複防止）

- `artifact-gate.json`: 成果物更新整合のみを判定（FR-13e）
- `governance-gate.json`: 承認・トレーサビリティ・工程違反を統合判定（FR-25, FR-27）
- `uat-trigger.json`: UAT 起動条件の注入のみを担当（FR-26）

---

## 4. MCP サーバー設計

### 4.1 ファイルシステム MCP（ローカル監査ログ操作）

**ファイル**: `.vscode/mcp.json`

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"],
      "type": "stdio"
    }
  }
}
```

**用途**: audit_log/events.jsonl や memory/ ディレクトリへの構造化アクセス。ブラウザやシェルを介さずに JSONL 操作が可能。

### 4.2 GitHub MCP（任意・CI/Issue連携）

```json
{
  "servers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "env": {
        "GITHUB_TOKEN": "${input:githubToken}"
      }
    }
  }
}
```

**用途** (スコープ外 Phase 1 で任意): GitHub Issues タスク管理連携、PR レビュー連携、CI 結果取得。`feature_flag.github_mcp_enabled` で制御。

---

## 5. Workspace Instructions 設計

### 5.1 `.github/copilot-instructions.md`

```markdown
# エージェントシステム共通指示

## 必須規約
- タスク開始前に必ず `memory/core.md` の内容を参照すること
- 工程遷移は requirements-definition.md → system-specification.md → delivery-plan.md → design.md → 実装 → レビューの順序のみ許可
- 各工程完了時に対応成果物ファイルを更新し、`state/current_task.json` の artifact_sync_status を更新すること
- `audit_log/events.jsonl` への記録はすべて JSONL 形式（1行1イベント）で行うこと

## コスト管理
- `state/budget_state.json` を各フェーズ前後で確認すること
- predicted_request_cost が remaining_request_budget の 80% 以上の場合は降格モードに移行すること
- タスク単位の premium request 消費推計を `state/current_task.json` に記録すること

## 自動進行ルール
- ユーザーの追加情報・意思決定・明示的承認が本質的に不要な場合は確認を挟まず次工程へ進むこと
- ユーザーへの質問が最低限になるよう、判断できる情報は自己判断して進めること
```

### 5.2 `.github/instructions/markdown-artifact.instructions.md`

```yaml
---
applyTo: "requirements-definition.md,system-specification.md,delivery-plan.md,design.md,review-report.md"
---
```

**内容**: 各成果物ファイルの更新時は、ファイル末尾に更新メタデータ（decision_id / sync_status / last_updated）を記録すること。stale 状態の成果物は先頭に `[STALE: <理由>]` ラベルを追加すること。

---

## 6. 実現困難・制約報告（上流出戻り検討）

### 6.1 問題: プレミアムリクエスト使用量のリアルタイム監視不可 (C-01)

**影響要件**: FR-05（コストガードレール）、KPI-2（タスク単位コスト）、NFR-02（コスト管理）

**現状**: GitHub Copilot のプレミアムリクエスト使用量は、VS Code の API・Hooks・MCP からプログラム的に取得できない。GitHub.com の使用量ページ、または GitHub API (`GET /orgs/{org}/copilot/usage`) から事後取得のみ可能。

**代替手段**: Coordinator エージェントがタスク実行中に `selected_model_multiplier × planned_user_prompts` で消費量を**推計**し、`state/budget_state.json` に累積記録する。ただし、これは推計値であり実際の課金との乖離が生じる可能性がある。

**上流への影響**:
> ✅ **[決定: Option A + 週次照合] 要件定義・設計・デリバリープランに反映済み**
>
> FR-05 の「検知」は推計ベースのソフト警告に限定されることを各文書に注記として追記した。NFR-02 の「2% 未満」目標は推計ベースでの評価とし、週次ガバナンス（OR-03）にて GitHub Copilot 使用量ページとの実績照合・精度補正を義務化した。
>
> **実施内容**:
> - requirements-definition.md KPI-2 に実装制約注記を追加
> - system-specification.md FR-05 注記・NFR-02・OR-03 に推計ベース管理と週次照合を追記
> - delivery-plan.md 検証観点に週次照合を追加
> - design.md §10.1 に制約と対応方針を追記

### 6.2 問題: 厳密なステート機械の強制 (C-06)

**影響要件**: FR-13d（工程順序強制ゲート）、FR-24（suspended 状態運用ポリシー）

**現状**: VS Code Copilot には LLM の実行フローを確定的にブロックするプラットフォーム機構がない。`PreToolUse` Hook でファイル編集ベースの工程チェックは可能だが、LLM が指示を無視してステップをスキップする状況を完全には防げない。

**代替手段**: `state/current_task.json` にステート・フェーズ情報を保持し、Coordinator の Instructions で工程チェックを必須化する。Hook の `artifact-gate-check.js` でファイル編集時に上流成果物の整合性を確認する。

**上流への影響**:
> ✅ **[決定: 注記追加] 要件定義・設計に反映済み**
>
> 「工程遷移ブロック」は LLM の Instructions による抑止であることを各文書に明記した。確定的強制は VS Code Extension 開発が必要となりスコープ外であることも記録した。
>
> **実施内容**:
> - system-specification.md FR-13d に実装制約注記を追加
> - design.md §10.2 に制約と対応方針を追記

### 6.3 問題: サブエージェント並列実行の保証 (C-02)

**影響要件**: FR-03（条件付き並列ポリシー）

**現状**: Coordinator エージェントの Instructions に「並列でサブエージェントを実行する」と記述することで LLM に並列意図を伝えられるが、実際のサブエージェント実行は LLM の逐次的なツール呼び出しで実現される。真の並列実行（マルチスレッド・非同期並列）は VS Code Copilot ではサポートされていない。

**代替手段**: `runSubagent` を複数回連続して呼び出すインターリーブ実行で「疑似並列」を実現する。並列上限 (FR-03) はサブエージェントの呼び出し数として管理し、分岐オーバーヘッド 15 秒超過時の直列化は累積タイムアウトで代替する。

**上流への影響**:
> ✅ **[決定: 注記追加] 要件定義・設計に反映済み**
>
> FR-03 の「並列レビュー」はインターリーブ実行（疑似並列）であることを各文書に明記した。分岐オーバーヘッド計測も推計ベースであることを記録した。
>
> **実施内容**:
> - system-specification.md FR-03 に実装制約注記を追加
> - design.md §10.3 に制約と対応方針を追記

### 6.4 問題: フェーズ結果キャッシュのセマンティックハッシュ (C-05)

**影響要件**: FR-14（フェーズ結果キャッシュ）

**現状**: VS Code Copilot にはキャッシュ機構が存在しない。`cache/` ディレクトリへのファイルベースキャッシュを実装するが、セマンティックハッシュの計算は LLM によるコンテンツ比較で代替する必要がある（SHA256 による正確なハッシュ計算は LLM 単体では困難）。

**代替手段**: Planner サブエージェントが `cache/planner/` の既存キャッシュエントリを読み込み、タスク契約の主要フィールドを比較して再利用判定を LLM ベースで行う。完全一致ではなくセマンティック類似度での判定となる。Hook スクリプト（`log-event.js`）から SHA256 計算は可能であり、cache_key の生成はスクリプトに委ねることもできる。

**上流への影響**:
> ✅ **[決定: AC-10 緩和] 要件定義に反映済み**

---

## 7. 設計補正（FR-25 / FR-26 / FR-27 対応）

要求定義・要件定義の更新（トレーサビリティ、UAT、Change Request）に合わせ、機能設計を次の通り補正する。

### 7.1 追加エージェント

1) Governance (`.github/agents/governance.agent.md`)
- 役割: トレーサビリティ同期（FR-25）と Change Request 管理（FR-27）を統合実行
- 起動タイミング: レビュー完了後、release 判定前
- 不整合時: release をブロックし、差分同期または承認フローを起動

2) UAT Runner (`.github/agents/uat-runner.agent.md`)
- 役割: Simple / Medium / Complex の代表シナリオ実行と判定記録
- 起動タイミング: Deep Review 後
- 出力: `review-report.md` へ pass/fail/conditional-pass と出戻り先を追記

分離ポリシー:
- Simple タスク: Governance を軽量モードで実行し、review 後の追加分離は行わない。
- Medium タスク: Governance + UAT Runner を有効化する。
- Complex タスク: Governance をフルモード（トレーサビリティ同期 + Change Request 影響分析）で実行する。

### 7.2 追加 Hook 連携

- `governance-gate.json`（PreToolUse）:
  - トレーサビリティ未同期、未承認変更、工程ゲート違反を統合判定し release 操作を抑止
- `uat-trigger.json`（PostToolUse / review-report 更新後）:
  - UAT Runner 起動の追加コンテキストを注入

### 7.3 Copilot 機能最適化の実装ルール

- モデル最適化:
  - 低リスク工程は included model 優先
  - 高リスク工程のみ premium model を許可
- リクエスト最適化:
  - 意思決定質問は原則1回のバッチ形式
  - 同一目的の追質問を抑制し、premium request 消費を削減
- 外部参照最適化:
  - 公式ドキュメント優先
  - 同一タスク内の重複フェッチを禁止

### 7.4 互換性注意

- Hooks は Preview 機能であり、仕様変更時は `.github/hooks/` と本書の同時更新が必要。
- Preview 非対応環境では、Coordinator Instructions ベースのソフト強制へ自動降格する。

補足（キャッシュ精度）:
- LLM ベースのキャッシュヒット判定は 100% 精度ではなく数%の誤検知が生じる。
- AC-10 の判定条件は「セマンティックハッシュ完全一致」ではなく「主要フィールド（goal / must-have constraints / complexity_class）のセマンティック一致」を採用する。
- system-specification.md AC-10 と design.md §7.2 の注記はこの方針に同期済み。

---

## 8. 機能要件と Copilot プリミティブのマッピング

| 機能要件 | 対応 Copilot プリミティブ | 実現方法 |
|---------|------------------------|--------|
| FR-01 要求解析 | Custom Agent (request-analyzer) | サブエージェントで分類・タスク契約JSON生成 |
| FR-01a トリアージ | Custom Agent 指示 | LLM 指示でパターン分類 |
| FR-02 ハンドオフ契約 | Coordinator 指示 + state/ ファイル | JSON ファイルで契約オブジェクトを受け渡し |
| FR-03 条件付き並列 | Coordinator 指示 + サブエージェント複数呼び出し | 疑似並列（§6.3 参照） |
| FR-04 モデルルーティング | `.agent.md` の `model` フィールド | 役割別エージェントに最適モデルを静的指定 |
| FR-05 コストガードレール | Hooks (SessionStart) + state/budget_state.json | 推計ベースの警告・降格 (§6.1 参照) |
| FR-06 逸脱検知と補正 | Coordinator 指示 + Drift Detector 指示 | LLM によるハンドオフ契約との比較 |
| FR-07 二段階レビュー | fast-gate.agent.md + deep-review.agent.md | 直列サブエージェント呼び出し |
| FR-07a Deep Review 必須/任意 | deep-review.agent.md 指示 + breaker_state 確認 | state ファイルで外部依存状態管理 |
| FR-08 フォールバック | Coordinator 指示 + 実行時フォールバック | タイムアウト検知後の最小結果レスポンス |
| FR-08a サーキットブレーカ | state/current_task.json + Coordinator 指示 | ファイルベースの breaker_state 管理 |
| FR-09 人手引き継ぎ | Coordinator 指示 (ループ上限超過時) | ユーザーへの構造化エスカレーションメッセージ |
| FR-10 機能調査 | Coordinator 指示 + fetch ツール | 上限時間・クエリ数の制約を Coordinator が遵守 |
| FR-11 複数案提示 | Decision Gate サブエージェント | 固定テンプレートで2案以上を構造化提示 |
| FR-12 意思決定ゲート | Decision Gate サブエージェント + state ファイル | pending 状態管理・SLA タイマー |
| FR-13 成果物パイプライン | Coordinator 指示 + Handoffs | 工程順序指示とファイル更新確認 |
| FR-13c 自動進行 | Workspace Instructions | 確認不要時の自動進行指示 |
| FR-13d 工程順序ゲート | phase-transition-guard Hook (PreToolUse) + Coordinator | Hook で順序強制、LLM 指示で補完 (§6.2 参照) |
| FR-13e 成果物更新ゲート | Artifact Gate Hook + state/current_task.json | 成果物更新状態のファイル管理 |
| FR-14 フェーズ結果キャッシュ | Planner サブエージェント + cache/ ファイル | LLM セマンティック比較 (§6.4 参照) |
| FR-15 エピソード記憶 | Episode Writer サブエージェント | タスク完了後に episodes/ へ記録 |
| FR-16 蒸留パイプライン | Distillation Worker サブエージェント + Skill | Phase 2 で有効化 |
| FR-17 メモリ取得 | Memory Retriever サブエージェント | Tier 別ロード制御 |
| FR-18 記憶競合解決 | Memory Retriever 指示 | LLM での conflict=true 判定 |
| FR-19 イベント層 | Audit Logger Hook (JSONL) + node スクリプト | append-only audit_log/events.jsonl |
| FR-19a 監査ログ仕様 | Audit Logger Hook + Coordinator 指示 | 必須フィールド検証 |
| FR-20 メモリアクセス運用 | Coordinator 指示 + state ファイル | suspended 状態での書き込み禁止 |
| FR-21 レビュー成果物 | Deep Review / Fast Gate サブエージェント | review-report.md の構造化更新 |
| FR-24 suspended 状態 | Coordinator 指示 + state/current_task.json | state ファイルベースの状態管理 |
| FR-25 トレーサビリティ同期 | Governance + governance-gate Hook | UR/BR/AC/証跡の同期検査と release ブロック |
| FR-26 UAT シナリオ実行 | UAT Runner + uat-trigger Hook | 複雑度別シナリオ実行と判定記録 |
| FR-27 Change Request 処理 | Governance + governance-gate Hook | 承認前変更の抑止と影響分析記録 |

---

## 9. Phase 別実装計画

### Phase 1 (Week 0-4): 最小構成

**Week 0**: Workspace Instructions + state/ ディレクトリ初期化 + baseline-metrics 計測
**Week 1**: Coordinator / Request Analyzer / Planner / Implementer / Fast Gate エージェント稼働
**Week 2**: Audit Logger Hook 有効化 + audit_log/ による events.jsonl 記録開始
**Week 3**: Episode Writer エージェント有効化 + memory/episodes/ 記録
**Week 4**: Cost Guard Hook + Artifact Gate Hook 有効化

### Phase 2 (Week 5-8): 強化

- Deep Review エージェント有効化 + サーキットブレーカ状態管理
- Memory Retriever サブエージェント + Tiered Memory 完全運用
- Decision Gate サブエージェント + Handoffs による意思決定フロー
- Governance / UAT Runner を有効化
- governance-gate / uat-trigger の Hook 連携を有効化

### Phase 3 (Week 9+): 最適化

- Distillation Worker エージェント有効化（エピソード蒸留）
- セマンティックハッシュキャッシュの精度改善
- 週次ガバナンス Prompt ファイルの定型化

---

## 10. 非機能要件への対応

| NFR | 対応設計 |
|-----|--------|
| NFR-01 性能 p50 ≤ 70秒 | included model (GPT-5 mini / GPT-4.1) を優先使用。直列実行を既定とし、条件付きのみ疑似並列 |
| NFR-02 コスト管理 | 推計ベース budget_state.json + SessionStart Hook での予算注入 |
| NFR-03 品質 95% | Fast Gate チェックリスト + Deep Review 必須チェック |
| NFR-04 一貫性 100% | Artifact Gate Hook による成果物整合性検証 |
| NFR-05 可観測性 | Audit Logger Hook (全ツール呼び出しを JSONL 記録) |
| NFR-06 信頼性 | Coordinator の Fallback 指示 + フォールバック最小結果レスポンス |
| NFR-07 意思決定トレーサビリティ | Decision Gate の DECISION_GATE_OPENED / DECISION_RECORDED イベント |
| NFR-08 メモリ予算 | Memory Retriever サブエージェントのロード量制御指示 |
| NFR-09 メモリ再構成性 | append-only events.jsonl からの再生 |
| NFR-10 メモリ保持 | Coordinator の定期メンテナンス指示 |
| NFR-11 索引整合性 | Episode Writer / Distillation Worker による index.json 更新 |
| NFR-12 監査ログ完全性 | Audit Logger Hook + 必須イベント欠損チェック |
| NFR-13 再開性/継続性 | Coordinator の再開制御 + 縮退運転ポリシー |
