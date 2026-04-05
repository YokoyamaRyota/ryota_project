---
description: "Use when: baseline-metrics の初期測定を実行し、Simple/Medium/Complex で KPI を記録するとき。"
mode: ask
---

# Baseline Measure

以下を入力として KPI を記録してください。

- complexity_class
- lead_time_minutes
- prompt_cost
- intent_compliance
- critical_miss
- decision_sla

出力形式:

```json
{
  "complexity_class": "simple|medium|complex",
  "kpi": {
    "lead_time": 0,
    "cost": 0,
    "intent_compliance": 0,
    "critical_miss": 0,
    "decision_sla": 0
  }
}
```