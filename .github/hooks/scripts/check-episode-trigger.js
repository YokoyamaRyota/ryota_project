const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '..', '..', '..', 'state', 'current_task.json');

try {
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const done = state?.current_workflow?.status === 'completed';
  const decisionMemoryPending = state?.memory_state?.episode_write_pending === true;
  const unresolvedHardDrift = state?.execution_tracking?.unresolved_hard_drift === true
    || state?.current_workflow?.hard_drift_unresolved === true;
  const rollbackVerificationPending = state?.execution_tracking?.rollback_verification_pending === true
    || state?.current_workflow?.rollback_verification_pending === true;
  const rollbackDetected = Boolean(state?.current_workflow?.rollback_target_phase)
    || rollbackVerificationPending;
  const staleArtifacts = Array.isArray(state?.artifact_tracking?.marked_for_deletion)
    && state.artifact_tracking.marked_for_deletion.length > 0;

  let blockReason = null;
  if (unresolvedHardDrift) {
    blockReason = 'Decision memory write blocked: unresolved hard drift.';
  } else if (rollbackDetected) {
    blockReason = 'Decision memory write blocked: rollback verification pending.';
  } else if (staleArtifacts) {
    blockReason = 'Decision memory write blocked: stale artifacts detected.';
  } else if (done && decisionMemoryPending) {
    blockReason = 'Episode Writer should write decision memory before stopping session.';
  }

  if (blockReason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        decision: 'block',
        reason: blockReason
      }
    }));
  }

  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
