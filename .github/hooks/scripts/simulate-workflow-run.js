const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const STATE_FILE = path.join(ROOT, 'state', 'current_task.json');

const audit = require(path.join(__dirname, '..', 'audit-logger.js'));
const phaseGuard = require(path.join(__dirname, '..', 'phase-transition-guard.js'));
const artifactGate = require(path.join(__dirname, '..', 'artifact-gate.js'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function run() {
  const originalState = readJson(STATE_FILE);
  const taskId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  const workingState = JSON.parse(JSON.stringify(originalState));
  workingState.task_contract.task_id = taskId;
  workingState.current_workflow.phase = 'requirement_analysis';
  workingState.current_workflow.status = 'in_progress';
  workingState.current_workflow.decision_id = decisionId;
  workingState.current_workflow.decision_state = 'recorded';
  workingState.current_workflow.decision_started_at = nowIso();
  workingState.system_status.current_phase = 'requirement_analysis';
  workingState.audit_trail.correlation_id = correlationId;

  writeJson(STATE_FILE, workingState);

  audit.logEvent({
    event_type: 'DECISION_GATE_OPENED',
    actor_role: 'Coordinator',
    phase: 'requirement_analysis',
    task_id: taskId,
    decision_id: decisionId,
    status: 'pending',
    payload: {
      selected_option: null,
      source: 'simulate-workflow-run'
    },
    correlation_id: correlationId
  });

  audit.logEvent({
    event_type: 'DECISION_RECORDED',
    actor_role: 'Coordinator',
    phase: 'requirement_analysis',
    task_id: taskId,
    decision_id: decisionId,
    status: 'recorded',
    payload: {
      selected_option: 'Option A',
      approver: 'simulator',
      source: 'simulate-workflow-run'
    },
    correlation_id: correlationId
  });

  const transitions = [
    'requirement_definition',
    'specification',
    'delivery_planning',
    'design',
    'implementation',
    'fast_review',
    'deep_review',
    'uat'
  ];

  const transitionResults = [];
  let currentPhase = 'requirement_analysis';

  for (const nextPhase of transitions) {
    const phaseCheck = phaseGuard.checkPhaseTransitionGuard({
      next_phase: nextPhase,
      task_id: taskId
    });

    if (!phaseCheck.approval) {
      transitionResults.push({
        from: currentPhase,
        to: nextPhase,
        status: 'blocked_by_phase_guard',
        details: phaseCheck
      });
      break;
    }

    const gateCheck = artifactGate.checkArtifactGate({
      next_phase: nextPhase,
      decision_id: '1970-01-01T00:00:00.000Z'
    });

    if (!gateCheck.approval) {
      transitionResults.push({
        from: currentPhase,
        to: nextPhase,
        status: 'blocked_by_artifact_gate',
        details: gateCheck
      });
      break;
    }

    audit.logEvent({
      event_type: 'PHASE_TRANSITION',
      actor_role: 'Coordinator',
      phase: nextPhase,
      task_id: taskId,
      decision_id: decisionId,
      status: 'approved',
      payload: {
        from_phase: currentPhase,
        to_phase: nextPhase,
        source: 'simulate-workflow-run'
      },
      correlation_id: correlationId
    });

    currentPhase = nextPhase;
    workingState.current_workflow.phase = nextPhase;
    workingState.system_status.current_phase = nextPhase;
    writeJson(STATE_FILE, workingState);
    transitionResults.push({ from: phaseCheck.current_phase, to: nextPhase, status: 'approved' });
  }

  // Restore original state to avoid contaminating active workflow.
  writeJson(STATE_FILE, originalState);

  return {
    task_id: taskId,
    decision_id: decisionId,
    correlation_id: correlationId,
    transition_results: transitionResults
  };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { run };
