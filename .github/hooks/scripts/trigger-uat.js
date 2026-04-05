const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const reportPath = path.join(__dirname, '..', '..', '..', 'review-report.md');
const statePath = path.join(__dirname, '..', '..', '..', 'state', 'current_task.json');
const auditPath = path.join(__dirname, '..', '..', '..', 'audit_log', 'events.jsonl');

function parseApprovalStatus(text) {
  const line = (text.match(/^\s*-\s*判定結果\s*:\s*(.+)$/m) || [])[1];
  if (!line) return null;

  // Ignore template status like "Approved / Rejected / ..."
  if (line.includes('/')) return null;

  const normalized = line.trim().toLowerCase();
  if (normalized === 'approved' || normalized === 'approved_with_conditions') {
    return normalized;
  }
  return null;
}

function loadState() {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function hasRecentUatTriggered(taskId, ttlMs) {
  if (!taskId || !fs.existsSync(auditPath)) return false;
  const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
  const now = Date.now();

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const evt = JSON.parse(lines[i]);
      if (evt.event_type !== 'UAT_TRIGGERED') continue;
      if (evt.task_id !== taskId) continue;
      const ts = new Date(evt.timestamp_utc).getTime();
      if (Number.isFinite(ts) && now - ts <= ttlMs) return true;
      if (Number.isFinite(ts) && now - ts > ttlMs) return false;
    } catch {
      // ignore malformed lines
    }
  }
  return false;
}

function appendUatEvent(taskId, complexity, phase) {
  const event = {
    event_id: crypto.randomUUID(),
    timestamp_utc: new Date().toISOString(),
    event_type: 'UAT_TRIGGERED',
    actor_role: 'hook',
    phase: phase || null,
    task_id: taskId || null,
    status: 'queued',
    payload: {
      triggered_by_phase: phase || null,
      complexity_class: complexity || null
    },
    correlation_id: null
  };
  fs.appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf8');
}

try {
  if (!fs.existsSync(reportPath)) process.exit(0);

  const text = fs.readFileSync(reportPath, 'utf8');
  const approvalStatus = parseApprovalStatus(text);
  if (!approvalStatus) process.exit(0);

  const state = loadState();
  if (!state) process.exit(0);

  const taskId = state?.task_contract?.task_id || null;
  const phase = state?.current_workflow?.phase || state?.system_status?.current_phase || null;
  const complexity = state?.task_contract?.complexity_class || null;

  // 5-minute duplicate prevention window
  if (hasRecentUatTriggered(taskId, 300000)) {
    process.exit(0);
  }

  state.current_workflow = state.current_workflow || {};
  state.current_workflow.uat_pending = true;
  saveState(state);
  appendUatEvent(taskId, complexity, phase);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: 'UAT trigger condition met. uat_pending=true and UAT_TRIGGERED event appended.'
    }
  }));

  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
