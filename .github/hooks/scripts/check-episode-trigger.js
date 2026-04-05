const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '..', '..', '..', 'state', 'current_task.json');

try {
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const done = state?.current_workflow?.status === 'completed';
  const hardDrift = (state?.execution_tracking?.drift_corrections || 0) > 0;

  if (done && !hardDrift) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        decision: 'block',
        reason: 'Episode Writer should run before stopping session.'
      }
    }));
  }

  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
