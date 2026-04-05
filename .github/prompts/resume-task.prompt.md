---
description: "Use when: 中断したタスクを state/current_task.json を基準に再開するとき。"
mode: ask
---

# Resume Task

次の情報を確認して再開プランを出力してください。

- task_id
- last_phase
- blocked_reason
- remaining_steps
- research_state

出力形式:

```json
{
  "task_id": "",
  "resume_phase": "",
  "required_artifacts": [],
  "first_action": "",
  "research_resume_action": ""
}
```