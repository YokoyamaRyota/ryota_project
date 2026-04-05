const path = require('path');
const fs = require('fs');
const gate = require(path.join(__dirname, '..', 'artifact-gate.js'));

const ROOT = path.join(__dirname, '..', '..', '..');
const STATE_FILE = path.join(ROOT, 'state', 'current_task.json');

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

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function extractNextPhase(payload, state) {
  const candidate =
    payload?.tool_input?.next_phase ||
    payload?.toolInput?.next_phase ||
    payload?.next_phase ||
    payload?.input?.next_phase;

  if (candidate) return candidate;

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

  if (inferredPhaseByAgent[agentName]) {
    return inferredPhaseByAgent[agentName];
  }

  // If no phase transition signal can be inferred, do not block.
  return null;
}

function isPhaseSensitiveEditWithoutPhase(payload, nextPhase) {
  if (nextPhase) return false;

  const toolName = extractToolName(payload);
  const phaseSensitiveTools = new Set(['apply_patch', 'create_file', 'edit']);
  if (!phaseSensitiveTools.has(toolName)) return false;

  return touchesPhaseArtifacts(payload);
}

function extractDecisionContext(payload, state) {
  const decisionId = (
    payload?.tool_input?.decision_id ||
    payload?.toolInput?.decision_id ||
    payload?.decision_id ||
    state?.current_workflow?.decision_id ||
    state?.task_contract?.decision_id ||
    null
  );

  const decisionTimestamp = (
    payload?.tool_input?.decision_timestamp ||
    payload?.toolInput?.decision_timestamp ||
    payload?.decision_timestamp ||
    state?.current_workflow?.decision_started_at ||
    null
  );

  return {
    decisionId,
    decisionTimestamp,
    taskId: state?.task_contract?.task_id || payload?.task_id || null
  };
}

try {
  const payload = readStdinJson();
  const state = loadState();
  const nextPhase = extractNextPhase(payload, state);
  const decision = extractDecisionContext(payload, state);

  if (isPhaseSensitiveEditWithoutPhase(payload, nextPhase)) {
    process.stdout.write(JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: 'MISSING_PHASE_SIGNAL: phase-sensitive artifact edit requires next_phase or inferable phase context'
    }));
    process.exit(0);
  }

  if (!nextPhase) {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    process.exit(0);
  }

  const result = gate.checkArtifactGate({
    next_phase: nextPhase,
    decision_id: decision.decisionId,
    decision_timestamp: decision.decisionTimestamp,
    task_id: decision.taskId
  });

  if (!result.approval) {
    process.stdout.write(JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: `${result.denial_code}: ${result.issues.join('; ')}`
    }));
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
