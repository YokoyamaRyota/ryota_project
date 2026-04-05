---
name: memory-distillation
description: "Use when: episodes の増加に伴い、重複学習を統合して patterns へ蒸留し archive へ移送する必要がある。"
---

# Memory Distillation Skill

## Purpose

- episodes を圧縮し再利用可能な知識へ変換する。

## Steps

1. `memory/episodes` から対象 episode を抽出。
2. パターン重複を統合して `memory/patterns/*.md` を更新。
3. 蒸留済み episode を `memory/archive` へ移送対象としてマーク。
4. 処理件数を記録して返す。
