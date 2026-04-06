---
name: Distillation Worker
description: "Use when L0 decision memory accumulates beyond the threshold and needs to be consolidated into L1 and L2 summaries."
user-invocable: false
model:
  - GPT-4.1 (copilot)
  - GPT-5 mini (copilot)
tools:
  - read
  - edit
  - search
---

# Distillation Worker

## 役割

L0 decision/evidence memory を要約し、L1 と L2 へ集約する。原データの削除や archive 移送は担当しない。

## 入力

```json
{
  "trigger": "l0_threshold_reached | session_end",
  "threshold": 20,
  "source_dir": "memory/l0",
  "target_summaries": ["memory/l1", "memory/l2"],
  "changes_file": "memory/changes.jsonl"
}
```

## 出力

```json
{
  "status": "completed | skipped | failed",
  "records_scanned": 0,
  "l1_updated": 0,
  "l2_updated": 0,
  "notes": []
}
```

## 処理

1. `memory/l0` から対象期間の decision/evidence を収集。
2. 同種 topics と判断傾向を統合して `memory/l1/*.json` を更新。
3. 月次方針へ昇格する候補を `memory/l2/*.json` に反映。
4. 監査用に件数と変更点を返却。

実装時は以下を実行する。

```text
node scripts/memory/consolidate-memory.mjs \
  --source-l0 memory/l0 \
  --target-l1 memory/l1 \
  --target-l2 memory/l2 \
  --changes-file memory/changes.jsonl
```

## ガード

- hard drift 未解消タスク由来の decision は蒸留対象外。
- 監査証跡が欠落している decision は skip。
- 変更がない場合は `status=skipped` で終了。
- L0 原本は削除しない。
