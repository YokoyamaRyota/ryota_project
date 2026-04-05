const path = require('path');
const fs = require('fs');
const governance = require(path.join(__dirname, '..', 'governance-gate.js'));

const ROOT = path.join(__dirname, '..', '..', '..');
const STATE_FILE = path.join(ROOT, 'state', 'current_task.json');
const REVIEW_REPORT_FILE = path.join(ROOT, 'review-report.md');

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

function parseTraceabilityFromReviewReport() {
  if (!fs.existsSync(REVIEW_REPORT_FILE)) return {};
  const text = fs.readFileSync(REVIEW_REPORT_FILE, 'utf8');

  const sourceUr = (text.match(/source_ur_id\s*:\s*(.+)/i) || [])[1]?.trim() || null;
  const mappedBr = (text.match(/mapped_br_id\s*:\s*(.+)/i) || [])[1]?.trim() || null;
  const reviewEvidence = (text.match(/audit_event_ref\s*:\s*(.+)/i) || [])[1]?.trim() || null;
  const acLine = (text.match(/validation_ac_id\s*:\s*(.+)/i) || [])[1]?.trim() || '';
  const frLine = (text.match(/affected_fr\s*:\s*(.+)/i) || [])[1]?.trim() || '';

  return {
    source_ur_id: sourceUr,
    mapped_br_id: mappedBr,
    affected_fr: frLine ? frLine.split(',').map(v => v.trim()).filter(Boolean) : [],
    validation_ac: acLine ? acLine.split(',').map(v => v.trim()).filter(Boolean) : [],
    review_evidence_id: reviewEvidence,
    traceability_verified: Boolean(sourceUr && mappedBr && reviewEvidence)
  };
}

function isReleaseContext(payload, state) {
  const phase = state?.current_workflow?.phase || state?.system_status?.current_phase || '';
  const toolName = String(payload?.tool_name || payload?.toolName || '').toLowerCase();
  const text = JSON.stringify(payload || {}).toLowerCase();

  if (phase === 'deep_review' || phase === 'uat' || phase === 'complete') return true;
  if (toolName.includes('release')) return true;
  if (text.includes('release') || text.includes('go/no-go') || text.includes('governance')) return true;

  return false;
}

try {
  const payload = readStdinJson();
  const state = loadState();

  if (!isReleaseContext(payload, state)) {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    process.exit(0);
  }

  const taskId =
    state?.task_contract?.task_id ||
    payload?.task_id ||
    null;
  const decisionId =
    state?.current_workflow?.decision_id ||
    state?.task_contract?.decision_id ||
    payload?.decision_id ||
    null;
  const changeRequests = state?.change_requests || [];
  const traceability = state?.traceability || parseTraceabilityFromReviewReport();

  const result = governance.evaluateGovernanceGate({
    task_id: taskId,
    decision_id: decisionId,
    change_requests: changeRequests,
    traceability
  });

  if (result.status === 'denied') {
    process.stdout.write(JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: result.deny_code
    }));
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
