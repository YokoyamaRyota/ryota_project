param(
  [string]$OutputDir = 'dist',
  [string]$PackageName = 'copilot-agent-system-package'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutRoot = Join-Path $RepoRoot $OutputDir
$PackageRoot = Join-Path $OutRoot $PackageName
$ZipPath = Join-Path $OutRoot ($PackageName + '.zip')

function Copy-ItemSafe {
  param([string]$SourceRelativePath, [string]$DestinationRoot)

  $src = Join-Path $RepoRoot $SourceRelativePath
  if (-not (Test-Path -LiteralPath $src)) {
    throw "Required source path not found: $SourceRelativePath"
  }

  $dst = Join-Path $DestinationRoot $SourceRelativePath
  $dstParent = Split-Path -Parent $dst
  if ($dstParent) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }

  if ((Get-Item $src).PSIsContainer) {
    Copy-Item -Path $src -Destination $dst -Recurse -Force
  } else {
    Copy-Item -Path $src -Destination $dst -Force
  }
}

$requiredPaths = @(
  '.github/agents',
  '.github/hooks',
  '.github/instructions',
  '.github/plugins',
  '.github/prompts',
  '.github/skills',
  '.github/copilot-instructions.md',
  'state',
  'audit_log',
  'cache',
  'memory',
  'requirements-definition.md',
  'system-specification.md',
  'delivery-plan.md',
  'design.md',
  'feature-design.md',
  'review-report.md',
  'external-deployment-usage-guide.md'
)

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null
if (Test-Path -LiteralPath $PackageRoot) {
  try {
    Remove-Item -LiteralPath $PackageRoot -Recurse -Force
  } catch {
    $suffix = (Get-Date).ToString('yyyyMMdd-HHmmss')
    $PackageName = "$PackageName-$suffix"
    $PackageRoot = Join-Path $OutRoot $PackageName
    $ZipPath = Join-Path $OutRoot ($PackageName + '.zip')
    Write-Host "Existing package folder is locked. Using fallback output: $PackageName"
  }
}
New-Item -ItemType Directory -Path $PackageRoot -Force | Out-Null

foreach ($path in $requiredPaths) {
  Copy-ItemSafe -SourceRelativePath $path -DestinationRoot $PackageRoot
}

Copy-Item -Path (Join-Path $RepoRoot 'packaging/setup.ps1') -Destination (Join-Path $PackageRoot 'setup.ps1') -Force
Copy-Item -Path (Join-Path $RepoRoot 'packaging/README.template.md') -Destination (Join-Path $PackageRoot 'README.md') -Force

$packageInfo = [ordered]@{
  package_name = $PackageName
  generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
  source_repo = 'agent-system-docs'
  entrypoint = 'setup.ps1'
  quick_start = 'powershell -ExecutionPolicy Bypass -File .\\setup.ps1 -RunValidation'
}

$packageInfo | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $PackageRoot 'package-info.json') -Encoding UTF8

if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path (Join-Path $PackageRoot '*') -DestinationPath $ZipPath -Force

Write-Host ''
Write-Host 'Package build completed.'
Write-Host "Folder: $PackageRoot"
Write-Host "Zip:    $ZipPath"
Write-Host ''
Write-Host 'Consumer setup command:'
Write-Host 'powershell -ExecutionPolicy Bypass -File .\\setup.ps1 -RunValidation'
