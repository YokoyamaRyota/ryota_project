# メモリシステム - Tier-1 Core

**最終更新**: 2026-04-05  
**役割**: 常時ロード（2,000 トークン目標）  
**対応ドキュメント**: `feature-design.md` § メモリ取得ポリシー

---

## 1. プロジェクトコア情報

### 1.1 プロジェクト定義

**プロジェクト名**: VS Code Copilot マルチエージェント開発システム  
**フェーズ**: Phase 1 (Week 0-4)  
**開始日**: 2026-04-05

**目標**:  
- 5 段階工程（要求定義 → 要件定義 → 計画 → 設計 → 実装 → レビュー）の自動オーケストレーション
- コスト・品質・速度のバランス維持
- 記憶継承による反復タスク高速化

### 1.2 ステークホルダー

- **開発者**: 要求・指示の入力者
- **Coordinator**: 工程全体の制御
- **各専門エージェント**: 役割分担実行

---

## 2. 工程と成果物マッピング

| 工程 | 確定条件 | 対応ファイル | 必須フィールド |
|-----|--------|-----------|-------------|
| 要求定義 | requirements-definition.md 更新 | requirements-definition.md | ビジネス目標・KPI・スコープ |
| 要件定義 | system-specification.md 更新 | system-specification.md | FR/NFR/OR/AC 完全定義 |
| 計画 | delivery-plan.md 作成 | delivery-plan.md | 実装順序・検証観点・出戻ルール |
| 設計 | design.md + feature-design.md 更新 | design.md, feature-design.md | アーキテクチャ・エージェント・Hook |
| 実装 | コード・成果物生成 | 対象ファイル | 動作確認・単体テスト |
| レビュー | review-report.md 更新・承認 | review-report.md | 受け入れ基準検証結果・承認判定 |

---

## 3. エージェント責務・インターフェース（要点）

### 3.1 Coordinator

**役割**: オーケストレーション・工程制御

**入力**: user_request + state/current_task.json  
**出力**: 次工程へのハンドオフ + state 更新  
**呼び出し**: 新規タスク・再開・ガバナンス

**キー制御**:
- state/current_task.json の phase フィールドに基づいて次工程指定
- 各工程の成果物ファイル更新を確認後のみ遷移
- 工程順序違反は artifact-gate.json Hook で検査

### 3.2 Request Analyzer

**役割**: 要求分類・契約生成

**分類**: known_pattern / new_required_capability / ambiguous_request  
**出力**: task_contract JSON

### 3.3 Planner

**役割**: 分解・計画

**入力**: task_contract  
**キャッシュ対象**: セマンティックハッシュ一致 + TTL内

### 3.4 Implementer

**役割**: 実装実行

**タイムアウト**: 60秒（2回超過で最小結果返却）

### 3.5 Fast Gate / Deep Review

**Fast Gate（20秒）**: 重大リスク検査  
**Deep Review（60秒）**: FR-07a の必須 + 任意チェック  
**必須**: 重大リスク領域は Deep Review 必須・コスト免除

### 3.6 Episode Writer

**役割**: タスク完了時の記憶記録

**禁止**: hard drift 未解消 / 出戻り後のタスクは記録しない

### 3.7 Memory Retriever → Distillation Worker

**ロード制御**: Tier-1 常時 + Tier-2/3 関連度上位

**蒸留**: episodes/ が閾値達成時に実行

###3.8 Governance（Phase 2 有効化）

**責務**: TR 同期（FR-25）+ CR 管理（FR-27）

### 3.9 UAT Runner（Phase 2 有効化）

**責務**: 代表シナリオ実行

### 3.10 Decision Gate

**SLA**: 4時間催促・24時間で suspended

---

## 4. Hook 責務・判定順序（重複防止）

| Hook | Trigger | 責務 | deny コード |
|------|---------|------|----------|
| artifact-gate | PreToolUse | 成果物整合 only | (成功時は通過) |
| governance-gate | PreToolUse | 承認・TR・工程 | PHASE_GATE_FAIL / CHANGE_UNAPPROVED / TRACEABILITY_MISSING |
| uat-trigger | PostToolUse | UAT 起動条件注入 | (条件不足時は skip) |

**多重起動防止**: task_id + decision_id

---

## 5. 状態管理・ポリシー

### 5.1 工程フェーズ（一方向）

```
requirement_analysis → requirement_definition → specification → 
delivery_planning → design → implementation → fast_review → 
deep_review → uat → complete
```

出戻り:必要に応じて上流へ全フェーズ逆戻り

### 5.2 意思決定ゲート SLA

- **pending**: default 4時間
- **4時間超過**: 催促通知
- **24時間超過**: suspended 遷移

### 5.3 サーキットブレーカ（外部依存障害）

- **closed**: 正常
- **open**: 連続失敗3件 or タイムアウト率50%以上 → ローカル処理のみ
- **half_open**: 復帰試行中

---

## 6. コスト管理(Included Models 優先)

### 6.1 予算警告メカニズム

```
threshold = 0.80 × remaining_budget
if predicted_cost >= threshold:
  apply_cost_guard()
```

### 6.2 降格順序

1. Deep Review 無効化
2. 並列実行 無効化
3. 低コストモデル強制
4. 最小結果レスポンス返却

---

## 7. 複雑度判定（総合評価）

- **Simple**: 変更行数 < 80 & ファイル数 ≤ 2
- **Medium**: 変更行数 80-300 or ファイル数 3-5
- **Complex**: 変更行数 > 300 or ファイル数 ≥ 6

※ ただし、ユーザー要求の性質・影響範囲・検討観点も考慮

---

## 8. 重大リスク領域（Deep Review 必須）

- 認証・認可ロジック
- 秘密情報・APIキー
- 課金・決済
- データ整合性・状態遷移
- 重要な外部連携

---

## 9. Phase 1 Week 0-4 マイルストーン

| Week | 完了条件 |
|------|---------|
| 0 | baseline-metrics 固定、state/ 初期化 |
| 1 | Coordinator + 3タスク実行、phase_transition + drift 記録 |
| 2 | events.jsonl 記録確認、欠損 0件 |
| 3 | hard drift タスク episode ブロック確認 |
| 4 | Cost+Artifact Gate 動作確認 |

---

## 10. 緊急対応・フォールバック

### 10.1 タイムアウト

- 指数バックオフ再試行（最大2回）
- 直列モード
- 最小結果レスポンス

### 10.2 外部依存障害

- breaker_state = open
- ローカル処理優先

-必須チェックは継続・任意は deferred

### 10.3 予算超過

- 降格順序適用
- ユーザー警告

---

**本 Core は Phase 1 Week 0 で確定。週次ガバナンスで段階的に拡張します。**
