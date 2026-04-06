# VS Code Copilot Workspace Instructions (Lean)

最終更新: 2026-04-06
Phase: 2 (Week 5)

## 1. 目的

このワークスペースでは、Copilot のマルチエージェント開発を次の優先順位で実行する。

1. 要求の正確化
2. 工程順序の厳守
3. 実装とレビューの整合
4. 監査可能性の維持

## 2. 必須工程順序

次の順序を必須とする。工程スキップは禁止。

1. requirement_analysis
2. requirement_definition
3. specification
4. delivery_planning
5. design
6. implementation
7. fast_review
8. deep_review
9. uat
10. complete

下流で重大問題が見つかった場合は、該当上流工程へ出戻る。

## 3. ハンドオフ契約

工程遷移時は次の 5 項目を保持する。

```json
{
  "goal": "...",
  "constraints": ["..."],
  "done_criteria": ["..."],
  "out_of_scope": ["..."],
  "acceptance_tests": ["..."]
}
```

## 4. 主要状態ファイル

- `state/current_task.json`: 現在の工程・判断状態
- `audit_log/events.jsonl`: append-only 監査ログ

## 5. レビュー必須観点

Fast Gate / Deep Review では次を優先検査する。

- 認証/認可
- 機密情報と資格情報
- 課金/決済
- データ整合性/永続化
- 重要な外部依存

## 6. 調査ポリシー

タスクごとに次を判定し、必要なら実装前に調査を実行する。

- `needs_internal_exploration`
- `needs_primary_source_verification`
- `needs_browser_observation`

調査結果には必ず以下を含める。

- evidence source
- confidence level
- unknowns

`needs_browser_observation=true` かつブラウザ不可時は、`browser_unavailable=true` と `remaining_uncertainty` を記録する。

## 7. コンテキスト管理ルール

- 常時指示は短く保つ。
- 詳細手順は必要時に読むファイルへ分離する。
- `applyTo: "**/*"` の利用は例外時のみ許可する。
- ファイル固有ルールは `.github/instructions/` でパターン適用する。

## 8. 完了条件

```text
task_complete =
  all_phases_complete AND
  hard_drift == 0 AND
  audit_log_complete == true
```

## 9. 補足

このファイルは常時読み込みを前提とするため、長文運用手順は含めない。運用詳細は各ドキュメントへ分離し、ここには必須ルールのみを維持する。