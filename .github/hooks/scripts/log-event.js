const path = require('path');
const fs = require('fs');
const audit = require(path.join(__dirname, '..', 'audit-logger.js'));

const hookEventName = process.argv[2] || 'UnknownHook';
const STATE_FILE = path.join(__dirname, '..', '..', '..', 'state', 'current_task.json');

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function summarizePayload(payload) {
  const toolName = payload?.tool_name || payload?.toolName || null;
  const toolInput = payload?.tool_input || payload?.toolInput || null;
  return {
    hook: hookEventName,
    tool_name: toolName,
    tool_input: toolInput
  };
}

try {
  const payload = readStdinJson();
  const state = loadState();
  const phase =
    state?.current_workflow?.phase ||
    state?.system_status?.current_phase ||
    null;
  const taskId = state?.task_contract?.task_id || null;
  const decisionId =
    state?.current_workflow?.decision_id ||
    state?.task_contract?.decision_id ||
    null;
  const correlationId = state?.audit_trail?.correlation_id || null;

  audit.logEvent({
    event_type: `HOOK_${hookEventName.toUpperCase()}`,
    actor_role: 'hook',
    phase,
    task_id: taskId,
    decision_id: decisionId,
    status: 'executed',
    payload: summarizePayload(payload),
    correlation_id: correlationId
  });
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
