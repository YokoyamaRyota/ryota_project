---
description: "Use when: audit_log/events.jsonl を追加・検証・参照する作業。イベント整合と最小スキーマを維持する。"
applyTo: "audit_log/**/*.jsonl"
---

# Audit Log Rules

- JSONL は 1 行 1 イベントを厳守する。
- event_id, timestamp_utc, event_type, status を必須とする。
- 既存行の上書き・削除は行わない（append-only）。
- deny/rollback 系イベントは reason または deny_code を含める。
