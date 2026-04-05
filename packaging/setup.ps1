param(
  [switch]$RunValidation,
  [switch]$SkipNodeCheck
)

$ErrorActionPreference = 'Stop'

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $PackageRoot

Write-Host "[setup] Starting package setup at $PackageRoot"

$requiredFiles = @(
  '.github/hooks/hooks-integration-test.js',
  '.github/hooks/governance-integration-test.js',
  '.github/plugins/planner-cache-test.js',
  '.github/plugins/memory-retriever-test.js',
  '.github/copilot-instructions.md',
  'state/current_task.json',
  'state/budget_state.json'
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Required file not found: $file"
  }
}

Write-Host "[setup] Required files check passed"

$runtimeDirs = @(
  'audit_log',
  'cache/planner',
  'cache/reviewer',
  'memory',
  'memory/episodes',
  'memory/archive',
  'memory/patterns',
  'state'
)

foreach ($dir in $runtimeDirs) {
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

if (-not (Test-Path -LiteralPath 'audit_log/events.jsonl')) {
  Set-Content -Path 'audit_log/events.jsonl' -Value '' -Encoding UTF8
}

if (-not (Test-Path -LiteralPath 'review-report.md')) {
  Set-Content -Path 'review-report.md' -Value '# レビュー報告書`n' -Encoding UTF8
}

if (-not $SkipNodeCheck) {
  Write-Host '[setup] Checking Node.js runtime'
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    throw 'Node.js is not available on PATH. Install Node.js v20+ and re-run setup.'
  }
  $nodeVersion = node -v
  Write-Host "[setup] Node.js detected: $nodeVersion"
}

if ($RunValidation) {
  Write-Host '[setup] Running validation tests'

  node .github/hooks/hooks-integration-test.js
  if ($LASTEXITCODE -ne 0) { throw 'hooks-integration-test.js failed' }

  node .github/hooks/governance-integration-test.js
  if ($LASTEXITCODE -ne 0) { throw 'governance-integration-test.js failed' }

  node .github/plugins/planner-cache-test.js
  if ($LASTEXITCODE -ne 0) { throw 'planner-cache-test.js failed' }

  node .github/plugins/memory-retriever-test.js
  if ($LASTEXITCODE -ne 0) { throw 'memory-retriever-test.js failed' }

  Write-Host '[setup] Validation tests passed'
}

Write-Host '[setup] Setup completed successfully'
Write-Host ''
Write-Host 'Next:'
Write-Host '1) Open this folder in VS Code'
Write-Host '2) Use Copilot Chat to run your task'
Write-Host '3) If needed, run: node .github/hooks/hooks-integration-test.js'
