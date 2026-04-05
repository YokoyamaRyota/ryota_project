const fs = require('fs');
const path = require('path');
const guard = require(path.join(__dirname, '..', 'phase-transition-guard.js'));

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractToolName(payload) {
  return payload?.tool_name || payload?.toolName || null;
}

function extractToolInput(payload) {
  return payload?.tool_input || payload?.toolInput || {};
}

function touchesPhaseArtifacts(payload) {
  const toolInput = extractToolInput(payload);
  const serializedInput = JSON.stringify(toolInput);
  const markers = [
    'requirements-definition.md',
    'system-specification.md',
    'delivery-plan.md',
    'design.md',
    'feature-design.md',
    'review-report.md',
    'state/current_task.json'
  ];

  return markers.some(marker => serializedInput.includes(marker));
}

function extractNextPhase(payload) {
  const explicitPhase = (
    payload?.tool_input?.next_phase ||
    payload?.toolInput?.next_phase ||
    payload?.next_phase ||
    payload?.input?.next_phase ||
    null
  );

  if (explicitPhase) return explicitPhase;

  const agentName =
    payload?.tool_input?.agentName ||
    payload?.toolInput?.agentName ||
    payload?.agentName ||
    null;

  const inferredPhaseByAgent = {
    'Request Analyzer': 'requirement_analysis',
    'Planner': 'delivery_planning',
    'Implementer': 'implementation',
    'Fast Gate': 'fast_review',
    'Deep Review': 'deep_review',
    'UAT Runner': 'uat'
  };

  return inferredPhaseByAgent[agentName] || null;
}

function isPhaseSensitiveEditWithoutPhase(payload, nextPhase) {
  if (nextPhase) return false;

  const toolName = extractToolName(payload);
  const phaseSensitiveTools = new Set(['apply_patch', 'create_file', 'edit']);
  if (!phaseSensitiveTools.has(toolName)) return false;

  return touchesPhaseArtifacts(payload);
}

try {
  const payload = readStdinJson();
  const nextPhase = extractNextPhase(payload);

  if (isPhaseSensitiveEditWithoutPhase(payload, nextPhase)) {
    process.stdout.write(
      JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: 'MISSING_PHASE_SIGNAL: phase-sensitive artifact edit requires next_phase or inferable phase context'
      })
    );
    process.exit(0);
  }

  // Guard explicit phase transitions and inferred phase transitions from subagent calls.
  if (!nextPhase) {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    process.exit(0);
  }

  const result = guard.checkPhaseTransitionGuard({ next_phase: nextPhase });

  if (!result.approval) {
    process.stdout.write(
      JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: `${result.denial_code}: ${(result.issues || []).join('; ')}`
      })
    );
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
