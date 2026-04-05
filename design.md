# 基本設計（粗設計）

## 1. 目的
本書は、要求定義および要件定義を入力として、次段階の詳細設計へ進むための粗い粒度の基本設計を示す。

## 2. 設計方針
- 役割分離は維持するが、制御の中核は Coordinator の状態機械で担う。
- 並列化は常時ではなく、ポリシーテーブルに基づいて条件付きで有効化する。
- 高ROI機能として、外部依存サーキットブレーカ、フェーズ結果キャッシュ、動的並列上限を優先採用する。
- Deep Review は必須チェックと任意チェックに分け、外部障害時も最低限の品質保証を継続する。
- 追加情報、意思決定、権限確認が不要な工程遷移は、Coordinator が自動で進める。

## 3. コンポーネント構成
- Coordinator
  - Drift Detector（統合）
  - Policy Engine（統合）
  - Circuit Breaker Manager（統合）
  - Cost Guard（Hook経由）
- Request Analyzer
- Planner
- Implementer
- Reviewer
  - Fast Gate
  - Deep Review
- Decision Gate
- Audit Logger（Hook経由）
- Memory Retriever
- Episode Writer
- Distillation Worker
- Governance
- UAT Runner
- MCP Bridge（任意）

## 4. 制御方式
Coordinator は以下の状態を管理する。
- requirement_analysis
- requirement_definition
- specification
- delivery_planning
- design
- implementation
- fast_review
- deep_review
- uat
- complete
- decision_pending
- release_gate
- change_request_review
- suspended

状態遷移条件はポリシーテーブルで管理する。
ポリシーテーブルの入力:
- complexity_class
- budget_remaining
- recent_p90_latency
- breaker_state
- drift_score
- decision_state
- artifact_sync_status
- rollback_target_phase

## 5. 主要フロー
1. Request Analyzer が要求を解析し、known_pattern / new_required_capability / ambiguous_request に分類する。
2. new_required_capability または ambiguous_request の場合のみ、複数案提示とユーザー意思決定を行う。
3. known_pattern の場合も、影響範囲を確認したうえで上流成果物の差分確認を行う。
4. 意思決定確定後に、要求定義 → 要件定義 → デリバリープラン → 設計の順で成果物を生成または更新する。
5. 上流成果物が確定した後、Planner はキャッシュを確認し、再利用可能なら短絡する。
6. Implementer 実行後、Coordinator 内の Drift Detector ロジックが hard/soft drift を評価する。
7. drift の原因が上流成果物にある場合、該当工程へ出戻りする。
8. Fast Gate が重大リスクを検知した場合、Deep Review を起動する。
9. Deep Review は、high-risk 領域または Fast Gate 重大検知時に必須となる。
10. レビューで設計起因、要件起因、要求起因の問題が見つかった場合、該当工程へ戻して成果物を更新する。
11. 外部依存が失敗した場合、Circuit Breaker が open へ遷移し、外部呼び出しを抑止する。
12. Cost Guard は各フェーズ前後で降格判定を行う。
13. ユーザー追加情報や明示的承認が不要な場合、Coordinator は確認質問を挟まずに次工程へ自動遷移する。
14. レビュー完了後、UAT Runner が複雑度別代表シナリオを実行し、結果を review-report.md に追記する。
15. release_gate で Go / No-Go 判定を行い、No-Go の場合は change_request_review または該当上流工程へ遷移する。

## 6. 障害対応
- タイムアウト2回: 任意作業をスキップし、最小結果レスポンスを返却
- 外部依存連続失敗3回: breaker_state=open、外部呼び出し停止
- hard drift 2回超過: 人手引き継ぎ
- soft drift 3回超過: 人手引き継ぎ
- decision pending 4時間超過: 催促通知
- decision pending 24時間超過: suspended
- breaker_state=open により deferred となった任意レビューは、breaker close 時または 24 時間後に再試行する
- suspended からの復帰は、decision 記録または cancel 記録後にのみ許可する

## 7. 解消済み設計論点
### 7.1 意思決定待ちによる遅延
- pending 時間は KPI-1 の計測対象から除外する。
- known_pattern をトリアージし、Decision Gate の適用範囲を限定する。

### 7.2 キャッシュの妥当性：セマンティックハッシュ仕様
- 完全一致ハッシュではなく、セマンティックハッシュを採用する。
- must-have 制約とビジネスロジック差分を優先して再利用判定する。

**セマンティックハッシュ定義：**
```
cache_key = SHA256(json_normalize({
  "goal": task.goal,
  "must_have_constraints": sorted([c for c in task.constraints if c.criticality == 'must-have']),
  "complexity_class": estimate_complexity(task),
  "diff_lines": approx_diff_size(task),  // 正確な行数ではなく「大きさレベル」
  "known_pattern_id": detect_known_pattern(task) || null
})).truncate_to(32_bits)
```

**衝突許容度：** 数% の誤検知を許容する（LLM セマンティック比較ベースのため 0.1% は達成困難。Hook スクリプトで SHA256 cache_key を生成する場合は精度が向上するが、完全一致のみに依存すると再利用率が低下する）

**再利用判定：**
- 主要フィールド（goal / must-have constraints / complexity_class）のセマンティック一致かつ TTL 内 → Planner 出力を再利用可
- ただし must-have constraints に追加・削除がある場合は再計画必須
- 実装制約: 判定は LLM セマンティック比較または Hook スクリプトの SHA256 で代行（§10.3 参照）

**実装備考：**
- ハッシュ計算は Planner フェーズの「キャッシュ確認」ステップで実行
- キャッシュヒット率は weekly_metrics に記録し、KPI-1 への寄与度を分析

### 7.3 Complex タスクのコスト増
- complex の並列上限は 2 に制限する。
- complex だけでは Deep Review を強制せず、high-risk 領域時のみ必須化する。

### 7.4 外部障害時のレビュー品質
- Deep Review を必須チェックと任意チェックに分ける。
- breaker_state=open でも必須チェックは継続し、任意チェックは deferred とする。

### 7.5 分類・高リスク領域マトリクス

| 区分 | 代表例 | 判定ルール | Deep Review |
|------|--------|------------|------------|
| known_pattern | 既存テンプレート適用、軽微改修 | 既知 pattern_id があり must-have 追加なし | 任意 |
| new_required_capability | 新機能、新規統合 | 既知 pattern_id なし、または新規依存あり | 条件付き |
| ambiguous_request | 目的や制約が不足 | goal / constraints / done criteria が欠落 | 実装前に解消 |
| high risk: auth | login, token, session | auth, login, permission, token を含む変更 | 必須 |
| high risk: secrets | credential, key, secret | secret, api_key, password, .env を含む変更 | 必須 |
| high risk: payment | charge, refund, billing | billing, checkout, payment を含む変更 | 必須 |
| high risk: integrity | transaction, state, DB | 永続化、状態遷移、更新系処理を含む変更 | 必須 |

## 8. 次段階で詳細化する項目
- 状態機械定義書
- ポリシーテーブル定義書
- セマンティックハッシュ仕様
- キャッシュTTLと無効化戦略
- breaker_state の時系列監視
- decision_pending / suspended の UI フロー

## 9. 残課題
- フォールバック時の部分成果物をどこまで確実に保持するか
- 意思決定UIを VS Code 上でどう表現するか
- 出戻り時に stale 扱いとなる下流成果物の表示と再承認フロー

## 10. 実装制約（機能設計フィードバック）

機能設計フェーズで特定された VS Code Copilot の制約と対応方針を記録する。

### 10.1 プレミアムリクエスト使用量のリアルタイム監視不可
- 消費量計測は Coordinator の推計値（planned_user_prompts × model_multiplier の累積）で代行する（FR-05、KPI-2 への影響）
- 週次ガバナンス（OR-03）で GitHub Copilot 使用量ページおよび GitHub API との実績照合を実施し、推計精度を補正する
- 超過インシデント判定（NFR-02）は推計ベースとし、照合後に実績値との乖離があれば次サイクルで補正する

### 10.2 工程順序ゲートは LLM 指示ベース強制
- FR-13d の遷移ブロックは Coordinator Instructions と `.github/hooks/artifact-gate.json` の PreToolUse Hook による抑止で実現する
- プラットフォームレベルの確定的強制ではなく、LLM のシステム指示遵守を前提とする
- 確定的な強制が必要になった場合は VS Code Extension 開発が必要となり、スコープ外となる

### 10.3 並列実行はインターリーブ実行（疑似並列）
- FR-03 の「並列レビュー」は `runSubagent` の複数連続呼び出しによるインターリーブ実行で実現する
- OS スレッドレベルの真の並列実行ではなく、分岐上限は連続するサブエージェント呼び出し数として管理する
- 分岐オーバーヘッド判定は Coordinator によるタイムスタンプ差分推計で代行する

## 11. 要求・要件整合の設計補正

本節は、要求定義および要件定義で追加された運用要件（工程ゲート、トレーサビリティ、UAT、変更管理、Runbook）を基本設計へ反映する。

### 11.1 工程ゲート設計
- 各工程で Entry / Exit 条件を満たすまで次工程へ遷移しない。
- Go / No-Go 判定は release_gate 状態で実施し、重大未解決事項が 0 の場合のみ Go とする。

### 11.2 トレーサビリティ設計
- Traceability Manager は `source_ur_id -> mapped_br_id -> validation_ac_id -> review_evidence_id` を成果物単位で保持する。
- 変更発生時は差分影響範囲を再計算し、未同期項目がある場合は release_gate をブロックする。

### 11.3 UAT 設計
- UAT Runner は Simple / Medium / Complex の代表シナリオを最低1件ずつ実行する。
- fail の場合は出戻り先工程を決定し、change_request_review へ遷移する。

### 11.4 Change Request 設計
- 変更要求は `change_reason / affected_artifacts / affected_kpis / approval_status` を最小項目として管理する。
- 承認前は本番運用値を更新しない。

## 12. Copilot 機能最適化の設計判断

### 12.1 モデル利用最適化
- Coordinator / Request Analyzer / Planner は included model 優先とし、高リスク工程のみ高性能モデルへ昇格する。
- 同一倍率モデルが複数ある場合は、最大性能モデルを優先し、同等性能の場合のみ直近30日の must-have 充足率と再作業率で選定する。

### 12.2 プロンプト回数最適化
- 意思決定ゲート質問は原則1回に集約し、複数確認事項を一括提示する。
- 追加質問は「方針確定に必須」の場合のみ許可する。

### 12.3 外部参照最適化
- 外部参照は高不確実性タスクのみに限定し、公式ドキュメントまたは一次情報を優先する。
- 同一タスク内で同一クエリを再取得せず、取得済みソースを再利用する。

### 12.4 Preview 機能依存の安全策
- Hooks 未利用または失敗時でも、Coordinator の工程チェックと成果物ゲートで最低限の安全性を維持する。
- Hooks 由来の失敗は致命障害ではなく degraded として扱い、監査ログへ記録する。