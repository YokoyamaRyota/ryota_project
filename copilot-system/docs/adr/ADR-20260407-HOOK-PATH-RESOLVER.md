# ADR: Hook Path Resolver 導入

## 0. 文書メタ情報
- document_id: ADR-20260407-HOOK-PATH-RESOLVER
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

## 1. 目的
固定パス依存が強い Hook 実装を最小差分で緩和し、将来のディレクトリ再配置時の破壊リスクを下げる。

## 2. 判定
判定: 採用

## 3. 根拠
- docs/SLIM-RESTRUCTURE-DESIGN.md の G1（path resolver 導入）
- docs/CURRENT-SYSTEM-IMPROVEMENT-DESIGN.md の AC-4（hooks/scripts が resolver 経由）
- `.github/hooks/artifact-gate.js`, `.github/hooks/phase-transition-guard.js`, `.github/hooks/governance-gate.js` が固定パス参照を持っていた

## 4. 変更内容
- `.github/hooks/lib/paths.js` を新設
- state/review-report/workspace root の解決を関数化
- 主要 3 Hook を resolver 経由参照へ変更

## 5. 代替案
1. 各 Hook に個別 fallback 実装を追加
2. 全 Hook を一括で大規模再設計
3. 不採用理由
- 1 は重複実装が増える
- 2 は変更範囲が大きく、現フェーズでのリスクが高い

## 6. 互換性影響
- path 互換: 既存 root 配置を優先しつつ、将来候補パスを fallback に保持
- schema 互換: 変更なし
- command 互換: 変更なし

## 7. ロールバック条件と手順
- 条件:
  - Hook 統合テストで回帰が発生
  - state/review-report 読み込み失敗が発生
- 手順:
  1. 3 Hook の resolver import と resolve 呼び出しを元の固定パスへ戻す
  2. `.github/hooks/lib/paths.js` を未使用化
  3. `node .github/hooks/hooks-integration-test.js` 再実行で復旧確認

## 8. 次アクション
1. scripts 側にも同等 resolver 層を適用する
2. 旧パス利用率を監査ログで可視化する
3. 2リリース無事故後に fallback 優先順位を見直す
