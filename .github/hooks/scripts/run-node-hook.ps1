param(
  [Parameter(Mandatory = $true)]
  [string]$Script,

  [string[]]$ScriptArgs = @(),

  [ValidateSet('allow', 'deny', 'context', 'silent')]
  [string]$FallbackMode = 'silent'
)

function Write-Fallback {
  param([string]$Mode)

  if ($Mode -eq 'allow') {
    Write-Output '{"permissionDecision":"allow"}'
    return
  }

  if ($Mode -eq 'deny') {
    Write-Output '{"permissionDecision":"deny","permissionDecisionReason":"HOOK_RUNTIME_UNAVAILABLE: Node.js is not available; hook script was skipped."}'
    return
  }

  if ($Mode -eq 'context') {
    Write-Output '{"hookSpecificOutput":{"additionalContext":"Node.js is not available; hook script was skipped."}}'
    return
  }
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Fallback -Mode $FallbackMode
  exit 0
}

$stdinPayload = [Console]::In.ReadToEnd()

try {
  if ([string]::IsNullOrWhiteSpace($stdinPayload)) {
    & node $Script @ScriptArgs
  } else {
    $stdinPayload | & node $Script @ScriptArgs
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Fallback -Mode $FallbackMode
    exit 0
  }

  exit 0
} catch {
  Write-Fallback -Mode $FallbackMode
  exit 0
}
