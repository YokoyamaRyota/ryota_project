---
description: "Use when: ルート直下への新規追加や配置変更を行う作業。ローカル最小構成の境界を維持する。"
applyTo: "**/*"
---

# Repo Layout Rules

## Purpose

- ローカル最小構成の境界を維持する。

## Rules

- ルート直下へ新規ファイルを追加する場合は、既存許可リストに含まれる目的のものだけ許可する。
- 実行時データは `copilot-system/runtime/state/`, `copilot-system/runtime/cache/`, `copilot-system/runtime/audit_log/`, `copilot-system/runtime/memory/` を優先し、互換期間のみ `state/` 直下を許可する。
- 配布系/外部連携系の削除済み領域（`mcp/`, `manifests/`, `packaging/`, `scripts/install-*`）を再導入しない。
- スキル正本は `copilot-system/src/skills/` とし、`.github/skills/` は生成物として扱う。
- `.github/agents/` は実行面の定義とし、テンプレート二重管理を増やさない。
