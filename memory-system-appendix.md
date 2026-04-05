# メモリシステム詳細別紙

## 1. 目的
本書は、要求定義では扱いきらないメモリシステムの詳細設計論点、運用パラメータ、イベント形式、形式保証の考え方を整理する。

## 2. 背景課題
- コンテキスト増大
- 記憶ファイル数の増加による検索精度低下
- 更新と整合性管理の困難

## 3. 設計原則

| 原則 | 内容 |
|------|------|
| 階層型メモリ | 常時ロードするコア記憶と必要時のみ取得する補助記憶を分離する |
| 構造化圧縮 | 会話ログを曖昧な自然文のまま保持せず、検索可能な atomic facts に正規化する |
| 蒸留パイプライン | エピソード記憶を要約・統合して再利用知識へ昇格させる |
| スマート検索と競合解決 | Hybrid Retrieval と再ランキングで関連度を高める |

## 4. メモリ階層

```
memory/
  core.md
  patterns/
    known_patterns.md
    failure_modes.md
  episodes/
    <task-id>.md
  archive/
  index.json
```

| 層 | 用途 | トークン上限 | 更新タイミング |
|----|------|------------|--------------|
| Tier-1 Core | プロジェクト不変制約、高頻度パターン | 2,000 | タスク10件ごと or 手動 |
| Tier-2 Patterns | 蒸留済み再利用知識 | 4,000（関連分のみ取得） | 蒸留時 |
| Tier-3 Episodes | タスクごとの実行詳細 | 上位K件のみ取得 | タスク完了時 |
| Tier-4 Archive | 蒸留後の監査保管 | ロード対象外 | 蒸留時 |

## 5. コンテキスト予算方針
- 現タスク情報: 最低 50%
- Tier-1 Core: 常時確保
- Tier-2 / Tier-3: 関連度上位のみ取得
- 総メモリロード量がコンテキストウィンドウの 20% を超える場合は Tier-3 を削減
- クエリ複雑度に応じて取得深度を可変化（低複雑度は shallow, 高複雑度は deep）
- コンテキスト投入は Full / Summary / Reference の3段階ティアで制御する

## 6. イベント層

イベント形式:
```
e = (timestamp, type, source, payload, ref)
```

代表イベント:
- EPISODE_WRITE
- DISTILL_EXECUTE
- PATTERN_MERGE
- CONFLICT_DETECTED
- MEMORY_PURGE
- INDEX_UPDATE
- DECISION_GATE_OPENED
- DECISION_RECORDED
- ROLLBACK_INITIATED
- ARTIFACT_INVALIDATED
- MEMORY_BLOCKED_ROLLED_BACK

## 7. メモリライフサイクル

### 7.1 書き込み
- task_contract
- 採用案と選定理由
- drift と補正内容
- レビュー指摘と解決策
- パターン分類

### 7.2 蒸留
- 既定閾値: 20 episodes またはセッション終了
- 生成知識を既存 Tier-2 と比較し、マージまたは追加
- 蒸留済み episodes を archive へ移動

### 7.2.1 階層要約（追加）
- 月次要約: 期間単位の中期記憶を生成し、時系列の連続性を維持する
- グローバル要約: 月次要約を統合して長期記憶を再構成する
- 推論時は「グローバル要約 + 直近エピソード + 関連検索結果」を基本投入セットとする

### 7.3 TTL と削除
- episodes: 30日後に archive 化
- archive: 既定 90 日以上保持
- Tier-2 は削除ではなく更新優先

### 7.4 競合解決
1. 新しいタイムスタンプ優先
2. より具体的なエントリ優先
3. 解決不能なら conflict=true で保持

### 7.5 信頼度と来歴（追加）
- 各メモリエントリに confidence と provenance（source, timestamp, derivation）を保持する
- 派生要約は derives_from を記録し、逆参照可能にする
- ユーザー明示修正は自動推論より優先し、強制反映する

## 8. 検索戦略

### 8.1 Hybrid Retrieval
- 既定重み: semantic 0.7 / keyword 0.3
- known_pattern: 0.5 / 0.5
- new_capability: 0.85 / 0.15

### 8.2 Re-ranking
- relevance_score
- recency_score
- access_score
- combined_score = 0.5 x relevance + 0.3 x recency + 0.2 x access

### 8.3 Complexity-aware Retrieval（追加）
- クエリ複雑度 C_q を推定し、取得件数を動的に制御する
- k_dyn = k_base x (1 + delta x C_q)
- 低複雑度: lexical/semantic の shallow 検索を優先
- 高複雑度: graph expansion と長期要約の併用を許可

### 8.4 構造化圧縮（追加）
- 書き込み時に代名詞解決・相対時刻の絶対化・主体の明確化を行う
- 非構造文のみを保持せず、検索用に atomic facts を副生成する
- 生成時の追加コストは「書き込み時の前払い」として扱い、読み取り効率を優先する

## 9. 主要リスクと対策
- Risk-M1 蒸留品質依存
- Risk-M2 埋め込みドリフト
- Risk-M3 メモリポイズニング
- Risk-M4 イベント層性能劣化
- Risk-M5 再構成検証コスト
- Risk-M6 ファインチューニングデータ品質
- Risk-M7 メモリファイル破損
- Risk-M8 蒸留結果の陳腐化

## 10. 形式保証の考え方

状態遷移は概念上次で表現する。
```
M_{t+1} = f(M_t, e_{t+1})
```

任意時点の状態は、初期状態とイベント列から再構成可能であることを前提とする。

実装上の要点:
- イベント記録を状態確定より先行させる
- リプレイで状態再現性を定期検証する
- 再構成失敗時はスナップショット退避とアラートを行う

## 11. 運用上の注意
- Phase 1 は記録優先であり、最適化や高度な競合解決は受け入れ条件に含めない
- モデル変更時は revision_needed を立てて段階的に再蒸留する
- 詳細パラメータは設計レビューと週次ガバナンスで見直す
- ツール起動率は instruction 本文より tool description の明確さに強く依存するため、description を短く具体的に保つ
- 記憶系運用の定着には、タスク開始時に読み込みを自動誘導する専用ツールまたはプリセットを用意する

## 12. 改善アクション（2026-04-05 調査反映）

### 12.1 即時反映（Low Risk）
- state.research_state に memory retrieval report の最終記録項目を追加する
- memory/index.json に confidence, provenance, derives_from のインデックスキーを追加する
- retrieval 結果に Full / Summary / Reference 区分を導入する

### 12.2 次スプリント反映（Medium Risk）
- episodes 生成時の atomic facts 抽出パスを追加する
- 複雑度推定（C_q）に基づく k_dyn 制御を memory retriever に実装する
- 月次要約・グローバル要約の2層要約ジョブを distillation worker に追加する

### 12.3 要検証（High Uncertainty）
- 忘却曲線ベースの decay 係数導入は、既存評価指標（精度・再現率・コスト）で A/B 検証後に採用判定する
- knowledge graph 連携は保守コストが高いため、まずは derives_from / superseded_by の最小関係から段階導入する