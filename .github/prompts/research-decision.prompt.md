---
name: research-decision
description: "Use when: タスク開始時に調査要否（internal/primary/browser）を判定し、実行順序とフォールバック条件を決める。"
agent: Coordinator
argument-hint: "タスク内容・受け入れ条件・制約を入力"
---

# Research Decision

以下を入力に、調査判定を行ってください。

- task_summary
- acceptance_tests
- constraints

必ず次を順番に実施:

1. needs_internal_exploration を true/false 判定
2. needs_primary_source_verification を true/false 判定
3. needs_browser_observation を true/false 判定
4. true の項目に対応する調査ステップを execution_plan に列挙
5. browser が必要なのに利用不可の場合、fallback を定義し `browser_unavailable` を含める

出力は JSON のみ:

```json
{
  "needs_internal_exploration": false,
  "needs_primary_source_verification": false,
  "needs_browser_observation": false,
  "execution_plan": [],
  "fallback_if_browser_unavailable": "",
  "evidence_requirements": [],
  "unknowns": []
}
```
