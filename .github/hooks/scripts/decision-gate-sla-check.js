/**
 * decision-gate-sla-check.js
 * 
 * 意思決定 SLA の自動監視・催促・suspended 遷移（FR-12）
 * 
 * Trigger: SessionStart（毎セッション開始時、または定期的なバッチで実行）
 * 
 * 処理：
 * 1. decision_state == "pending" の場合、開始からの経過時間を計測
 * 2. 4時間超過 → 催促通知イベント記録
 * 3. 24時間超過 → decision_state = "suspended" へ遷移
 */

const path = require('path');
const fs = require('fs');
const audit = require(path.join(__dirname, '..', 'audit-logger.js'));

const ROOT = path.join(__dirname, '..', '..', '..');
const STATE_FILE = path.join(ROOT, 'state', 'current_task.json');

const SLA_REMINDER_HOURS = 4;
const SLA_SUSPENDED_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;
const REMINDER_THRESHOLD_MS = SLA_REMINDER_HOURS * MS_PER_HOUR;
const SUSPENDED_THRESHOLD_MS = SLA_SUSPENDED_HOURS * MS_PER_HOUR;

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
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getCurrentTimeMs() {
  return new Date().getTime();
}

function checkAndUpdateDecisionSLA() {
  const state = loadState();
  if (!state) return { action: 'none', reason: 'no state file' };

  const currentPhase = state?.current_workflow?.phase || null;
  const decisionState = state?.current_workflow?.decision_state || null;

  // Only monitor if we're actually pending
  if (decisionState !== 'pending') {
    return { action: 'none', reason: `decision_state is ${decisionState}` };
  }

  const decisionStartedAt = state?.current_workflow?.decision_started_at || null;
  if (!decisionStartedAt) {
    // First detection of pending state - initialize timestamp
    if (!state.current_workflow) state.current_workflow = {};
    state.current_workflow.decision_started_at = new Date().toISOString();
    saveState(state);
    return { action: 'initialized', reason: 'first pending detection' };
  }

  const startTimestamp = new Date(decisionStartedAt).getTime();
  const elapsedMs = getCurrentTimeMs() - startTimestamp;

  // Check 24h threshold first (to do auto-suspend)
  if (elapsedMs >= SUSPENDED_THRESHOLD_MS) {
    state.current_workflow.decision_state = 'suspended';
    state.current_workflow.suspended_reason = 'SLA_EXCEEDED_24H';
    state.current_workflow.decision_suspended_at = new Date().toISOString();
    saveState(state);

    audit.logEvent({
      event_type: 'DECISION_SUSPENDED',
      actor_role: 'system',
      phase: currentPhase,
      task_id: state?.task_contract?.task_id || null,
      decision_id: state?.current_workflow?.decision_id || null,
      status: 'suspended',
      payload: {
        reason: 'SLA_EXCEEDED_24H',
        pending_hours: Math.round(elapsedMs / MS_PER_HOUR),
        action: 'auto_transition_to_suspended'
      },
      correlation_id: state?.audit_trail?.correlation_id || null
    });

    return { action: 'suspended', reason: '24-hour SLA exceeded' };
  }

  // Check 4h threshold (reminder)
  if (elapsedMs >= REMINDER_THRESHOLD_MS && !state.current_workflow.reminder_sent_at) {
    state.current_workflow.reminder_sent_at = new Date().toISOString();
    saveState(state);

    audit.logEvent({
      event_type: 'DECISION_REMINDER',
      actor_role: 'system',
      phase: currentPhase,
      task_id: state?.task_contract?.task_id || null,
      decision_id: state?.current_workflow?.decision_id || null,
      status: 'reminded',
      payload: {
        pending_hours: Math.round(elapsedMs / MS_PER_HOUR),
        remaining_hours_until_suspended: SLA_SUSPENDED_HOURS - Math.round(elapsedMs / MS_PER_HOUR),
        action: 'send_reminder'
      },
      correlation_id: state?.audit_trail?.correlation_id || null
    });

    return { action: 'reminder_sent', reason: '4-hour threshold exceeded' };
  }

  return {
    action: 'monitoring',
    reason: 'within SLA',
    hours_elapsed: Math.round(elapsedMs / MS_PER_HOUR),
    hours_remaining_for_reminder: Math.round((REMINDER_THRESHOLD_MS - elapsedMs) / MS_PER_HOUR)
  };
}

try {
  const result = checkAndUpdateDecisionSLA();
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
