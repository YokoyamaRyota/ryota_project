/**
 * governance-integration-test.js
 *
 * Governance integration tests:
 * - Rule order: phase -> change request -> traceability
 * - deny_code mapping
 * - duplicate prevention behavior
 */

const governance = require('./governance-gate.js');

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  return {
    label,
    ok,
    actual,
    expected,
    message: ok ? 'PASS' : `FAIL: expected=${expected}, actual=${actual}`
  };
}

function baseInput() {
  return {
    task_id: uniqueId('TASK'),
    decision_id: uniqueId('DEC'),
    max_allowed_phase: 'deep_review',
    current_task: {
      current_workflow: {
        phase: 'deep_review'
      }
    },
    change_requests: [
      { id: 'CR-001', approval_status: 'approved' }
    ],
    traceability: {
      source_ur_id: 'UR-01',
      mapped_br_id: 'BR-03',
      affected_fr: ['FR-25', 'FR-26'],
      validation_ac: ['AC-22', 'AC-23'],
      review_evidence_id: 'REV-1001',
      traceability_verified: true
    }
  };
}

function testApprovedPath() {
  const input = baseInput();
  const result = governance.evaluateGovernanceGate(input);

  return [
    assertEqual(result.status, 'approved', 'Approved path status'),
    assertEqual(result.deny_code, null, 'Approved path deny_code')
  ];
}

function testPhaseFailPriority() {
  const input = baseInput();
  input.current_task.current_workflow.phase = 'implementation';
  input.change_requests = [{ id: 'CR-001', approval_status: 'pending' }];
  input.traceability.traceability_verified = false;

  const result = governance.evaluateGovernanceGate(input);

  return [
    assertEqual(result.status, 'denied', 'Phase fail status'),
    assertEqual(result.deny_code, 'PHASE_GATE_FAIL', 'Phase fail priority deny_code')
  ];
}

function testChangeUnapprovedPriority() {
  const input = baseInput();
  input.change_requests = [{ id: 'CR-002', approval_status: 'pending' }];
  input.traceability.traceability_verified = false;

  const result = governance.evaluateGovernanceGate(input);

  return [
    assertEqual(result.status, 'denied', 'Change request fail status'),
    assertEqual(result.deny_code, 'CHANGE_UNAPPROVED', 'Change request fail priority deny_code')
  ];
}

function testTraceabilityMissing() {
  const input = baseInput();
  input.traceability.review_evidence_id = null;

  const result = governance.evaluateGovernanceGate(input);

  return [
    assertEqual(result.status, 'denied', 'Traceability fail status'),
    assertEqual(result.deny_code, 'TRACEABILITY_MISSING', 'Traceability fail deny_code')
  ];
}

function testDuplicatePrevention() {
  const input = baseInput();
  input.task_id = 'TASK-DUP';
  input.decision_id = 'DEC-DUP';

  const first = governance.evaluateGovernanceGate(input);
  const second = governance.evaluateGovernanceGate(input);

  return [
    assertEqual(first.status, 'approved', 'Duplicate first evaluation status'),
    assertEqual(second.cached_result, true, 'Duplicate second evaluation uses cache')
  ];
}

function runAllTests() {
  const all = [];

  all.push(...testApprovedPath());
  all.push(...testPhaseFailPriority());
  all.push(...testChangeUnapprovedPriority());
  all.push(...testTraceabilityMissing());
  all.push(...testDuplicatePrevention());

  const passed = all.filter(t => t.ok).length;
  const failed = all.length - passed;

  const summary = {
    timestamp: new Date().toISOString(),
    total_tests: all.length,
    passed,
    failed,
    status: failed === 0 ? 'passed' : 'failed',
    tests: all
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = { runAllTests };

if (require.main === module) {
  const summary = runAllTests();
  process.exit(summary.status === 'passed' ? 0 : 1);
}
