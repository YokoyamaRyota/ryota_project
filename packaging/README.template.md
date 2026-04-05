# Copilot Agent System Package

## 1. 目的

このパッケージは、VS Code Copilot マルチエージェント開発システムを最小構成で配布し、ダウンロード後に 1 コマンドでセットアップ完了できるようにするためのものです。

## 2. 判定

このパッケージは次の条件を満たした場合に利用準備完了と判定します。

1. setup.ps1 がエラーなく完了する
2. 必須ディレクトリと必須ファイルが存在する
3. -RunValidation 指定時に統合テストが pass する

## 3. 根拠

このパッケージには、次の主要機能を実現するための必須構成を同梱しています。

- 工程順序ゲート: .github/hooks/phase-transition-guard.js
- 成果物更新ゲート: .github/hooks/artifact-gate.js
- 監査ログ: .github/hooks/audit-logger.js
- ガバナンスゲート: .github/hooks/governance-gate.js
- UAT トリガ: .github/hooks/scripts/trigger-uat.js

## 4. セットアップ手順

### 前提

- Windows PowerShell
- Node.js v20 以上
- VS Code + GitHub Copilot Chat

### 1 コマンド実行

PowerShell でパッケージのルートに移動し、次を実行してください。

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -RunValidation
```

検証を省略したい場合:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

## 5. 使用方法

1. VS Code でパッケージフォルダを開く
2. Copilot Chat にタスクを入力する
3. 完了時に必要なら統合テストを再実行する

```powershell
node .github/hooks/hooks-integration-test.js
```

## 6. 次アクション

1. 配布元リポジトリで scripts/build-release-package.ps1 を使って zip を作成
2. GitHub Release に zip を添付
3. 受領側は展開後 setup.ps1 を実行
