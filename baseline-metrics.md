# ベースラインメトリクス

**最終更新**: 2026-04-05  
**フェーズ**: Phase 1 Week 0  
**対応要件**: KPI-1（リードタイム）、OR-05（段階的リリース）

---

## 1. ベースライン計測の目的

バージョン管理前の参考プロジェクト（またはシステム導入前の実績）を基準として固定し、Week 1 以降の改善効果を測定するための比較対象とします。

---

## 2. 計測対象タスク

### 2.1 Simple タスク

**定義**: 変更行数 < 80、ファイル数 ≤ 2、単純な修正  
**代表シナリオ**:
- ドキュメント表記ゆれ修正
- コメント更新
- 既存ロジック内での小規模パラメータ調整

**計測タスク数**: 3～5 件推奨  
**期待値（参考値）**: p50 = 30～60秒（業務環境による変動あり）

### 2.2 Medium タスク

**定義**: 変更行数 80-300、ファイル数 3-5  
**代表シナリオ**:
- 既存プロセスの改善
- 複数ファイルにまたがる更新
- 新規機能の追加/統合（小規模）

**計測タスク数**: 3～5 件推奨  
**期待値（参考値）**: p50 = 60～120秒

### 2.3 Complex タスク

**定義**: 変更行数 > 300 または複数外部連携  
**代表シナリオ**:
- 大規模新規機能実装
- アーキテクチャ変更
- 複数システム連携の実装

**計測タスク数**: 2～3 件推奨  
**期待値（参考値）**: p50 = 120～180秒

---

## 3. 計測対象メトリクス

### 3.1 リードタイム（KPI-1）

**定義**: タスク開始から レビュー完了まで の経過時間（ユーザー待機時間除く）

**計測方法**:
1. Coordinator 起動時刻を記録
2. review-report.md 作成・承認完了時刻を記録
3. 差分 = ユーザー待機なしの場合のみ対象

**分析単位**:
- **p50（中央値）**: 設計目標値の比較基準
- **p90（90パーセンタイル）**: ばらつき評価

### 3.2 コスト（KPI-2）

**定義**: タスク単位の premium request 消費量

**計測方法**:
- Coordinator による `planned_user_prompts × selected_model_multiplier` の推計
- 週次ガバナンスで GitHub Copilot 使用量ページと照合

**分析単位**:
- Simple: 1.0 以下（目標）
- Medium: 2.0 以下（目標）
- Complex: 4.0 以下（目標）

### 3.3 意図準拠率（KPI-3）

**定義**: goal/constraints/done_criteria の充足率

**計測方法**: レビュー工程で goal_achieved = true であるタスク数 / 計測対象タスク総数

**目標**: 90% 以上

### 3.4 重大見逃し率（KPI-4）

**定義**: レビューで検出されなかった既知の重大問題

**計測方法**: 仕込みテストシナリオで測定

**目標**: 5% 以下

### 3.5 意思決定応答性（KPI-5）

**定義**: 複数案提示から Decision Gate 開始までの時間中央値

**計測方法**: timestamp 記録ベース

**目標**: 3分以内

---

## 4. Week 0 計測計画

### 4.1 計測タイミング

**実施期間**: 2026-04-05 ～ 2026-04-12（1週間）  
**計測規模**: Simple 3件、Medium 3件、Complex 2件（合計8件）

### 4.2 計測対象タスク選定基準

1. **代表性**: 実際の開発タスク（ドメイン多様性）
2. **独立性**: タスク間に依存関係なし
3. **反復可能性**: 同一タスクは計測対象外（キャッシュ効果を避けるため）

### 4.3 記録フォーマット

```json
{
  "baseline_measurement": {
    "measurement_date": "2026-04-05",
    "measurement_end_date": "2026-04-12",
    "sample_size": 8,
    "locked": false,
    "lock_date": null,
    "simple_tasks": [
      {
        "task_id": "BASELINE_SIMPLE_001",
        "task_description": "ドキュメント表記ゆれ修正",
        "start_time": "2026-04-05T09:00:00Z",
        "end_time": "2026-04-05T09:02:15Z",
        "leadtime_seconds": 135,
        "cost_premium_requests": 0.5,
        "goal_achieved": true,
        "reviewer": "manual_baseline"
      }
    ],
    "medium_tasks": [],
    "complex_tasks": [],
    "statistics": {
      "simple_p50_seconds": null,
      "simple_p90_seconds": null,
      "medium_p50_seconds": null,
      "medium_p90_seconds": null,
      "complex_p50_seconds": null,
      "complex_p90_seconds": null,
      "overall_cost_per_task_simple": null,
      "overall_cost_per_task_medium": null,
      "overall_cost_per_task_complex": null
    }
  }
}
```

---

## 5. 計測完了後の処理

### 5.1 ロック化

Week 1 開始前に以下を実行：

1. `baseline-metrics.md` 内の statistics セクションを確定値で埋める
2. `locked = true` に変更
3. `lock_date` に確定日時を記録
4. requirements-definition.md 内の KPI の参考値を更新

### 5.2 基準値の利用開始

- **Week 1 以降**: 各タスク計測時に、この baseline-metrics と比較
- **目標**:
  - Phase 1 終了時（Week 4）: T0 の 0.85 倍以下（システム安定化）
  - Phase 2 終了時（Week 8）: T0 の 0.75 倍以下（メモリ効果現れ始め）
  - Phase 3（Week 9+）: T0 の 0.65 倍以下（蒸留パイプライン効果）

---

## 6. 計測除外タスク

以下は KPI-1 計測対象から除外：

- ユーザー意思決定待ち時間
- pending / suspended 状態の保留時間
- 外部依存サーキットブレーカ open 期間

---

## 7. 追加計測項目（参考値）

### 7.1 ドリフト発生率

```
drift_rate = (hard_drift_count + soft_drift_count) / total_tasks
```

**目標**: hard drift 0、soft drift rate < 0.2

### 7.2 再試行率

```
retry_rate = total_retries / total_tasks
```

**目標**: < 10%

### 7.3 フォールバック率

```
fallback_rate = fallback_trigger_count / total_tasks
```

**目標**: < 5%

---

## 8. 計測実施チェックリスト

- [ ] Phase 1 Week 0 で計測対象 8 タスク選定完了
- [ ] Coordinator + Request Analyzer + Planner + Implementer + Fast Gate が動作確認
- [ ] state/current_task.json が各タスクで正常に更新
- [ ] audit_log/events.jsonl が タスク開始～完了まで記録
- [ ] review-report.md が各タスクで作成・承認
- [ ] baseline-metrics の statistics セクション埋め込み完了
- [ ] lock_date 記録＆ locked = true

---

**ベースラインは Week 1 開始前に確定します。その後、段階的な改善を測定開始します。**
