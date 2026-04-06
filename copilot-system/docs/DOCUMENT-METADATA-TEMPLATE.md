# 文書メタ情報テンプレート

## 0. 文書メタ情報
- document_id: DOC-METADATA-TEMPLATE-001
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

## 1. 目的
Normative 文書と Informative 文書の追跡性を統一し、重複管理と更新漏れを防ぐ。

## 2. 判定
判定: Active

## 3. 根拠
- docs/SLIM-RESTRUCTURE-DESIGN.md の 9.5, 9.6, 9.7 で定義された運用ルール
- docs/CURRENT-SYSTEM-IMPROVEMENT-DESIGN.md の重複整理方針

## 4. メタ情報ブロック
以下を各文書の先頭に記載する。

```text
document_id: DOC-XXXX
classification: normative | informative
status: draft | active | deprecated
owner: team-or-role
last_reviewed: YYYY-MM-DD
supersedes: DOC-YYYY | none
```

## 5. 運用ルール
- `classification=normative` の文書は実装拘束力を持つ。
- `status=deprecated` は参照禁止ではなく、置換先が確定するまで互換期間を持つ。
- 30 日以上 `last_reviewed` が更新されない `active` 文書は stale 候補として週次レビュー対象にする。

## 6. 次アクション
1. 主要設計文書へメタ情報ブロックを追加する。
2. validate-configs もしくは docs チェックに、必須メタ情報の欠落検知を追加する。
