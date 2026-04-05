const path = require('path');
const costGuard = require(path.join(__dirname, '..', 'cost-guard.js'));

try {
  const result = costGuard.onSessionStart();
  const context = {
    hookSpecificOutput: {
      additionalContext: `Budget remaining: ${result?.budget_status?.remaining ?? 'unknown'}, action: ${result?.action_taken ?? 'none'}`
    }
  };
  process.stdout.write(JSON.stringify(context));
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
