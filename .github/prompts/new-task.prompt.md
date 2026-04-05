---
description: "Use when: 新規タスクを開始し、task_contract を初期化して実行フローへ投入するとき。"
mode: ask
---

# New Task

以下を入力して新規タスクを開始してください。

- goal
- constraints
- done_criteria
- out_of_scope
- acceptance_tests
- research_requirements

出力形式:

```json
{
  "goal": "",
  "constraints": [],
  "done_criteria": [],
  "out_of_scope": [],
  "acceptance_tests": [],
  "research_requirements": {
    "needs_internal_exploration": false,
    "needs_primary_source_verification": false,
    "needs_browser_observation": false,
    "evidence_requirements": [],
    "research_goal": "",
    "scope_boundary": "",
    "acceptance_checks": [],
    "stop_conditions": []
  }
}
```