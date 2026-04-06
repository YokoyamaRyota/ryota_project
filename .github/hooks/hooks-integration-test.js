/**
 * hooks-integration-test.js
 * 
 * 4 つの Hook の統合テストを実行
 * - audit-logger.js（JSONL 記録・再構成）
 * - artifact-gate.js（成果物ゲート）
 * - phase-transition-guard.js（工程順序・出戻り検出）
 * - governance-gate.js（工程順序 + CR 承認 + トレーサビリティ）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const auditLogger = require('./audit-logger.js');
const artifactGate = require('./artifact-gate.js');
const phaseTransitionGuard = require('./phase-transition-guard.js');
const governanceGate = require('./governance-gate.js');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..');
const TEST_RESULTS_FILE = path.join(WORKSPACE_ROOT, 'copilot-system', 'tests', 'results', 'hooks-integration-test-results.json');

/**
 * テスト結果をまとめる
 */
class TestResultAggregator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      hooks: {},
      overall_status: 'passed',
      total_tests: 0,
      passed_tests: 0,
      failed_tests: 0
    };
  }

  addHookTest(hook_name, test_name, passed, details) {
    if (!this.results.hooks[hook_name]) {
      this.results.hooks[hook_name] = { tests: [] };
    }

    this.results.hooks[hook_name].tests.push({
      test_name: test_name,
      passed: passed,
      details: details,
      timestamp: new Date().toISOString()
    });

    this.results.total_tests++;
    if (passed) {
      this.results.passed_tests++;
    } else {
      this.results.failed_tests++;
      this.results.overall_status = 'failed';
    }
  }

  getSummary() {
    return this.results;
  }

  writeToFile() {
    fs.mkdirSync(path.dirname(TEST_RESULTS_FILE), { recursive: true });
    fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(this.results, null, 2), 'utf8');
  }
}

const aggregator = new TestResultAggregator();

/**
 * Test Suite 1: audit-logger
 */
function testAuditLogger() {
  console.log('\n=== Test Suite 1: Audit Logger ===\n');

  try {
    // Test 1: SessionStart initialization
    auditLogger.onSessionStart();
    aggregator.addHookTest('audit-logger', 'SessionStart Initialization', true, 'Logger initialized');

    // Test 2: Event logging
    const event = auditLogger.logEvent({
      event_type: 'TEST_EVENT',
      actor_role: 'test',
      phase: 'design',
      task_id: 'test-001',
      status: 'passed',
      payload: { test_data: 'sample' }
    });
    aggregator.addHookTest('audit-logger', 'Event Logging', true, `Event logged: ${event.event_id}`);

    // Test 3: Event query
    const events = auditLogger.queryEvents({ event_type: 'TEST_EVENT' });
    const query_passed = events.length > 0;
    aggregator.addHookTest('audit-logger', 'Event Query', query_passed, `Found ${events.length} events`);

    // Test 4: Log integrity validation
    const integrity = auditLogger.validateLogIntegrity();
    aggregator.addHookTest('audit-logger', 'Log Integrity', integrity.valid, `Valid: ${integrity.valid}, Total events: ${integrity.total_events}`);

    // Test 5: System state reconstruction
    const reconstructed = auditLogger.reconstructSystemState();
    const reconstruct_passed = reconstructed.events.length >= 2; // SESSION_START + TEST_EVENT
    aggregator.addHookTest('audit-logger', 'System State Reconstruction', reconstruct_passed, `Events: ${reconstructed.events.length}`);

  } catch (error) {
    aggregator.addHookTest('audit-logger', 'Test Suite Error', false, error.message);
  }
}

/**
 * Test Suite 2: artifact-gate
 */
function testArtifactGate() {
  console.log('\n=== Test Suite 2: Artifact Gate ===\n');

  try {
    const designDocPath = 'copilot-system/docs/CURRENT-SYSTEM-IMPROVEMENT-DESIGN.md';

    // Test 1: File existence check
    const exists = artifactGate.fileExists(designDocPath);
    aggregator.addHookTest('artifact-gate', 'File Existence Check', exists, `${designDocPath} exists: ${exists}`);

    // Test 2: Sync status extraction
    if (exists) {
      const sync_status = artifactGate.extractSyncStatus(designDocPath);
      const sync_ok = sync_status === null || typeof sync_status === 'string';
      aggregator.addHookTest('artifact-gate', 'Sync Status Extraction', sync_ok, `Sync status: ${sync_status || 'not_found'}`);
    }

    // Test 3: Must-have fields check (現行設計書の見出しに合わせる)
    const expectedFields = ['## 1. 目的', '## 2. 判定', '## 3. 根拠', '## 12. 次アクション'];
    const must_have_check = artifactGate.checkMustHaveFields(designDocPath, expectedFields);
    const must_have_ok = must_have_check.all_found;
    aggregator.addHookTest('artifact-gate', 'Must-Have Fields Check', must_have_ok, `Missing: [${must_have_check.missing.join(', ')}]`);

    // Test 4: Artifact gate check (valid phase)
    const gate_result = artifactGate.checkArtifactGate({
      next_phase: 'requirement_analysis',
      decision_id: null
    });
    const gate_ok = gate_result.approval && gate_result.issues.length === 0;
    aggregator.addHookTest('artifact-gate', 'Artifact Gate Check', gate_ok, `Issues: ${gate_result.issues.length}`);

  } catch (error) {
    aggregator.addHookTest('artifact-gate', 'Test Suite Error', false, error.message);
  }
}

/**
 * Test Suite 3: phase-transition-guard
 */
function testPhaseTransitionGuard() {
  console.log('\n=== Test Suite 3: Phase Transition Guard ===\n');

  try {
    // Test 1: Valid transition validation
    const valid_trans = phaseTransitionGuard.validateTransition('design', 'implementation');
    aggregator.addHookTest('phase-transition-guard', 'Valid Transition Validation', valid_trans.valid, valid_trans.reason);

    // Test 2: Invalid transition detection
    const invalid_trans = phaseTransitionGuard.validateTransition('implementation', 'design');
    aggregator.addHookTest('phase-transition-guard', 'Invalid Transition Detection', !invalid_trans.valid, invalid_trans.reason);

    // Test 3: Backtrack detection
    const backtrack = phaseTransitionGuard.detectBacktrack('fast_review', 'design');
    aggregator.addHookTest('phase-transition-guard', 'Backtrack Detection', backtrack.is_backtrack, `Jump levels: ${backtrack.jump_levels}`);

    // Test 4: Skip detection
    const skip = phaseTransitionGuard.detectSkip('design', 'uat');
    aggregator.addHookTest('phase-transition-guard', 'Skip Detection', skip.is_skip, `Skipped phases: ${skip.skipped_phases.join(', ')}`);

    // Test 5: Phase transition check (requires active task)
    const transition_guard = phaseTransitionGuard.checkPhaseTransitionGuard({
      next_phase: 'requirement_definition',
      task_id: 'test-001'
    });
    const guard_check_ok = transition_guard.approval === false && (transition_guard.issues?.length || 0) > 0;
    aggregator.addHookTest('phase-transition-guard', 'Phase Transition Guard Check', guard_check_ok, `Approval: ${transition_guard.approval}, Issues: ${transition_guard.issues?.length || 0}`);

  } catch (error) {
    aggregator.addHookTest('phase-transition-guard', 'Test Suite Error', false, error.message);
  }
}

/**
 * Test Suite 4: governance-gate
 */
function testGovernanceGate() {
  console.log('\n=== Test Suite 4: Governance Gate ===\n');

  try {
    // Test 1: Approved path
    const approvedResult = governanceGate.evaluateGovernanceGate({
      task_id: 'gov-test-001',
      decision_id: `dec-${Date.now()}`,
      max_allowed_phase: 'deep_review',
      current_task: {
        current_workflow: { phase: 'deep_review' }
      },
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
    aggregator.addHookTest('governance-gate', 'Approved Path', approvedResult.status === 'approved', `Status: ${approvedResult.status}`);

    // Test 2: Phase gate fail priority
    const phaseFail = governanceGate.evaluateGovernanceGate({
      task_id: 'gov-test-002',
      decision_id: `dec-${Date.now()}-2`,
      max_allowed_phase: 'deep_review',
      current_task: {
        current_workflow: { phase: 'implementation' }
      },
      change_requests: [{ id: 'CR-002', approval_status: 'pending' }],
      traceability: {
        source_ur_id: 'UR-01',
        mapped_br_id: 'BR-01',
        affected_fr: ['FR-25'],
        validation_ac: ['AC-22'],
        review_evidence_id: null,
        traceability_verified: false
      }
    });
    aggregator.addHookTest('governance-gate', 'Phase Priority Check', phaseFail.deny_code === 'PHASE_GATE_FAIL', `Deny code: ${phaseFail.deny_code}`);

    // Test 3: Change request unapproved
    const crFail = governanceGate.evaluateGovernanceGate({
      task_id: 'gov-test-003',
      decision_id: `dec-${Date.now()}-3`,
      max_allowed_phase: 'deep_review',
      current_task: {
        current_workflow: { phase: 'deep_review' }
      },
      change_requests: [{ id: 'CR-003', approval_status: 'pending' }],
      traceability: {
        source_ur_id: 'UR-01',
        mapped_br_id: 'BR-01',
        affected_fr: ['FR-25'],
        validation_ac: ['AC-22'],
        review_evidence_id: 'REV-003',
        traceability_verified: true
      }
    });
    aggregator.addHookTest('governance-gate', 'Change Request Approval Check', crFail.deny_code === 'CHANGE_UNAPPROVED', `Deny code: ${crFail.deny_code}`);

    // Test 4: Traceability missing
    const traceFail = governanceGate.evaluateGovernanceGate({
      task_id: 'gov-test-004',
      decision_id: `dec-${Date.now()}-4`,
      max_allowed_phase: 'deep_review',
      current_task: {
        current_workflow: { phase: 'deep_review' }
      },
      change_requests: [{ id: 'CR-004', approval_status: 'approved' }],
      traceability: {
        source_ur_id: 'UR-01',
        mapped_br_id: null,
        affected_fr: [],
        validation_ac: ['AC-22'],
        review_evidence_id: null,
        traceability_verified: false
      }
    });
    aggregator.addHookTest('governance-gate', 'Traceability Check', traceFail.deny_code === 'TRACEABILITY_MISSING', `Deny code: ${traceFail.deny_code}`);

  } catch (error) {
    aggregator.addHookTest('governance-gate', 'Test Suite Error', false, error.message);
  }
}

/**
 * Test Suite 5: repo-layout-gate
 */
function testRepoLayoutGate() {
  console.log('\n=== Test Suite 5: Repo Layout Gate ===\n');

  try {
    const gateScript = path.join(__dirname, 'scripts', 'repo-layout-check.js');
    const gateConfig = path.join(__dirname, 'repo-layout-gate.json');

    // Test 1: Required files exist
    const filesExist = fs.existsSync(gateScript) && fs.existsSync(gateConfig);
    aggregator.addHookTest('repo-layout-gate', 'Gate Files Exist', filesExist, `script: ${filesExist}`);

    // Test 2: Forbidden path is denied
    const denyPayload = {
      tool_name: 'create_file',
      tool_input: { filePath: 'mcp/catalog.json' }
    };
    const denyResult = spawnSync('node', [gateScript], {
      cwd: WORKSPACE_ROOT,
      input: JSON.stringify(denyPayload),
      encoding: 'utf8'
    });
    const denyOutput = JSON.parse(denyResult.stdout || '{}');
    const denyOk = denyOutput.permissionDecision === 'deny';
    aggregator.addHookTest('repo-layout-gate', 'Forbidden Path Deny', denyOk, JSON.stringify(denyOutput));

    // Test 3: Allowed write is accepted
    const allowPayload = {
      tool_name: 'create_file',
      tool_input: { filePath: '.github/instructions/tmp-test.md' }
    };
    const allowResult = spawnSync('node', [gateScript], {
      cwd: WORKSPACE_ROOT,
      input: JSON.stringify(allowPayload),
      encoding: 'utf8'
    });
    const allowOutput = JSON.parse(allowResult.stdout || '{}');
    const allowOk = allowOutput.permissionDecision === 'allow';
    aggregator.addHookTest('repo-layout-gate', 'Allowed Path Pass', allowOk, JSON.stringify(allowOutput));
  } catch (error) {
    aggregator.addHookTest('repo-layout-gate', 'Test Suite Error', false, error.message);
  }
}

/**
 * メイン テスト実行
 */
function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Hooks Integration Test Suite Started  ║');
  console.log('╚════════════════════════════════════════╝\n');

  testAuditLogger();
  testArtifactGate();
  testPhaseTransitionGuard();
  testGovernanceGate();
  testRepoLayoutGate();

  const summary = aggregator.getSummary();
  aggregator.writeToFile();

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          Test Results Summary          ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(JSON.stringify(summary, null, 2));

  console.log(`\n📊 Overall Status: ${summary.overall_status.toUpperCase()}`);
  console.log(`✅ Passed: ${summary.passed_tests}/${summary.total_tests}`);
  console.log(`❌ Failed: ${summary.failed_tests}/${summary.total_tests}`);
  console.log(`\n📝 Results saved to: ${TEST_RESULTS_FILE}\n`);

  return summary.overall_status === 'passed';
}

// エクスポート
module.exports = {
  runAllTests
};

// 直接実行時
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}
