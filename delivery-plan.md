# デリバリープラン

## 1. 目的
本書は、要求定義と要件定義に基づき、実装順序、検証方法、依存関係、マイルストーンを定義する。

## 2. 入力成果物
- requirements-definition.md
- system-specification.md
- design.md
- review-report.md

## 3. 実施順序
1. Week 0 ベースライン計測
2. 上流成果物の差分確認
3. 実装対象の分解
4. 実装順序の決定
5. 検証項目の定義
6. 実装
7. レビュー
8. 必要時の出戻り

### 3.1 ベースライン計測
- 代表タスクを Simple / Medium / Complex ごとに選定する
- baseline-metrics に p50 / p90、測定日、件数、比較対象を記録する
- ベースライン固定前に Phase 1 の KPI 判定を開始してはならない

### 3.2 成果物差分確認
- requirements-definition.md、system-specification.md、design.md、delivery-plan.md の更新日時と decision_id を確認する
- must-have 制約に差分がある場合は full re-planning を行う
- comment / whitespace のみの差分は記録のみとし、再計画要否を明示する

### 3.3 週次受け入れ条件

| Week | 完了条件 |
|------|----------|
| 0 | baseline-metrics を固定し、比較対象を承認済み |
| 1 | known_pattern 3件以上を実行し、phase transition と drift が記録される |
| 2 | audit_log のサンプリング再生が成功し、欠損イベント 0 件 |
| 3 | hard drift 未解消タスクの episode 書き込みがブロックされる |
| 4 | distillation 失敗時に episode を保持したまま再試行できる |

## 4. マイルストーン
- M1: 上流成果物確定
- M2: 実装着手可能判定
- M3: 実装完了
- M4: レビュー完了
- M5: 完了判定

## 5. 出戻りルール
- 要求・要件の不整合を検出した場合は、該当する上流成果物へ戻る。
- 設計不整合を検出した場合は、design.md を更新してから実装を再開する。
- 実装順序や依存関係の誤りを検出した場合は、本書を更新して再計画する。
- 出戻り発生時は、下流成果物を stale として列挙し、review-report.md に記録する。
- stale 成果物の再確認が終わるまで、完了判定を行ってはならない。

## 6. 検証観点
- must-have 制約の充足
- 受け入れ基準の網羅
- 非機能要件への影響
- レビュー観点の事前定義
- high risk 領域判定の妥当性
- audit_log の必須イベント記録
- stale 成果物の再承認完了
- premium request 推計値と GitHub Copilot 使用量ページとの週次照合（コスト管理検証）
- 工程順序ゲートの Hook 動作確認（artifact-gate.json の PreToolUse 発火検証）
- サブエージェントのインターリーブ実行がタイムアウト制約内に収まること