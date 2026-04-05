/**
 * governance-gate.js
 *
 * Hook: governance-gate
 * Trigger: PreToolUse (release decision)
 *
 * Rule order (strict):
 * 1) PHASE_GATE_FAIL
 * 2) CHANGE_UNAPPROVED
 * 3) TRACEABILITY_MISSING
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, 'state', 'current_task.json');
const REVIEW_REPORT_FILE = path.join(ROOT, 'review-report.md');
const DUPLICATE_CACHE_FILE = path.join(__dirname, '.governance-gate-cache.json');

const PHASE_SEQUENCE = [
  'requirement_analysis',
  'requirement_definition',
  'specification',
  'delivery_planning',
  'design',
  'implementation',
  'fast_review',
  'deep_review',
  'uat',
  'complete'
];

function loadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function nowMs() {
  return Date.now();
}

function normalizePhase(state) {
  if (!state) return null;
  if (state.current_workflow && state.current_workflow.phase) return state.current_workflow.phase;
  if (state.system_status && state.system_status.current_phase) return state.system_status.current_phase;
  return null;
}

function checkPhaseGate(state, options = {}) {
  const phase = normalizePhase(state);
  const maxAllowedPhase = options.max_allowed_phase || 'deep_review';

  if (!phase) {
    return { ok: true, skipped: true, reason: 'No active phase' };
  }

  const currentIdx = PHASE_SEQUENCE.indexOf(phase);
  const maxIdx = PHASE_SEQUENCE.indexOf(maxAllowedPhase);

  if (currentIdx === -1 || maxIdx === -1) {
    return {
      ok: true,
      skipped: true,
      reason: `Unknown phase value (current=${phase}, max=${maxAllowedPhase})`
    };
  }

  if (currentIdx < maxIdx) {
    return {
      ok: false,
      deny_code: 'PHASE_GATE_FAIL',
      reason: `Current phase ${phase} is behind required phase ${maxAllowedPhase}`
    };
  }

  return { ok: true };
}

function checkChangeRequestApproval(changeRequests = []) {
  const pending = changeRequests.filter(cr => (cr.approval_status || '').toLowerCase() !== 'approved');
  if (pending.length > 0) {
    return {
      ok: false,
      deny_code: 'CHANGE_UNAPPROVED',
      reason: `${pending.length} change request(s) not approved`,
      pending_change_requests: pending
    };
  }
  return { ok: true };
}

function extractTraceabilitySignals(payload = {}) {
  return {
    source_ur_id: payload.source_ur_id || payload.source_ur || null,
    mapped_br_id: payload.mapped_br_id || payload.mapped_br || null,
    affected_fr: payload.affected_fr || [],
    validation_ac: payload.validation_ac || [],
    review_evidence_id: payload.review_evidence_id || null,
    traceability_verified: payload.traceability_verified === true
  };
}

function checkTraceability(payload = {}) {
  const t = extractTraceabilitySignals(payload);

  const missing = [];
  if (!t.source_ur_id) missing.push('source_ur_id');
  if (!t.mapped_br_id) missing.push('mapped_br_id');
  if (!Array.isArray(t.affected_fr) || t.affected_fr.length === 0) missing.push('affected_fr');
  if (!Array.isArray(t.validation_ac) || t.validation_ac.length === 0) missing.push('validation_ac');
  if (!t.review_evidence_id) missing.push('review_evidence_id');
  if (!t.traceability_verified) missing.push('traceability_verified');

  if (missing.length > 0) {
    return {
      ok: false,
      deny_code: 'TRACEABILITY_MISSING',
      reason: `Missing traceability fields: ${missing.join(', ')}`,
      missing
    };
  }

  return { ok: true };
}

function loadDuplicateCache() {
  return loadJson(DUPLICATE_CACHE_FILE, { entries: [] });
}

function saveDuplicateCache(cache) {
  saveJson(DUPLICATE_CACHE_FILE, cache);
}

function checkDuplicate(taskId, decisionId, ttlSeconds = 3600) {
  if (!taskId || !decisionId) {
    return { duplicate: false, cacheKey: null };
  }

  const cacheKey = `${taskId}:${decisionId}`;
  const cache = loadDuplicateCache();
  const ts = nowMs();

  cache.entries = cache.entries.filter(e => ts - e.timestamp_ms <= ttlSeconds * 1000);

  const found = cache.entries.find(e => e.key === cacheKey);
  if (found) {
    saveDuplicateCache(cache);
    return { duplicate: true, cacheKey };
  }

  cache.entries.push({ key: cacheKey, timestamp_ms: ts });
  saveDuplicateCache(cache);
  return { duplicate: false, cacheKey };
}

function evaluateGovernanceGate(input = {}) {
  const state = input.current_task || loadJson(STATE_FILE, {});
  const reviewReportExists = fs.existsSync(REVIEW_REPORT_FILE);

  const duplicate = checkDuplicate(input.task_id, input.decision_id, input.duplicate_ttl_seconds || 3600);
  if (duplicate.duplicate) {
    return {
      status: 'approved',
      cached_result: true,
      deny_code: null,
      findings: [],
      action: 'skip_duplicate'
    };
  }

  const phaseCheck = checkPhaseGate(state, { max_allowed_phase: input.max_allowed_phase || 'deep_review' });
  if (!phaseCheck.ok) {
    return {
      status: 'denied',
      deny_code: phaseCheck.deny_code,
      findings: [{ issue: phaseCheck.reason, impact: 'release decision blocked' }],
      action: 'GOVERNANCE_GATE_DENIED',
      review_report_exists: reviewReportExists
    };
  }

  const crCheck = checkChangeRequestApproval(input.change_requests || []);
  if (!crCheck.ok) {
    return {
      status: 'denied',
      deny_code: crCheck.deny_code,
      findings: [{ issue: crCheck.reason, impact: 'release decision blocked' }],
      pending_change_requests: crCheck.pending_change_requests,
      action: 'GOVERNANCE_GATE_DENIED',
      review_report_exists: reviewReportExists
    };
  }

  const traceCheck = checkTraceability(input.traceability || {});
  if (!traceCheck.ok) {
    return {
      status: 'denied',
      deny_code: traceCheck.deny_code,
      findings: [{ issue: traceCheck.reason, impact: 'release decision blocked' }],
      missing_traceability_fields: traceCheck.missing,
      action: 'GOVERNANCE_GATE_DENIED',
      review_report_exists: reviewReportExists
    };
  }

  return {
    status: 'approved',
    deny_code: null,
    findings: [],
    action: 'GOVERNANCE_GATE_PASSED',
    review_report_exists: reviewReportExists
  };
}

module.exports = {
  evaluateGovernanceGate,
  checkPhaseGate,
  checkChangeRequestApproval,
  checkTraceability,
  checkDuplicate,
  PHASE_SEQUENCE
};

if (require.main === module) {
  const result = evaluateGovernanceGate({
    task_id: 'sample-task',
    decision_id: 'sample-decision',
    change_requests: [{ id: 'CR-001', approval_status: 'approved' }],
    traceability: {
      source_ur_id: 'UR-01',
      mapped_br_id: 'BR-01',
      affected_fr: ['FR-25'],
      validation_ac: ['AC-22'],
      review_evidence_id: 'REV-001',
      traceability_verified: true
    }
  });
  console.log(JSON.stringify(result, null, 2));
}
