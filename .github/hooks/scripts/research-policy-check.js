const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', '..', 'state', 'current_task.json');

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : {};
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

function hasResearchIntent(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return /(調査|比較|一次情報|公式|最新仕様|検証|browser|ブラウザ|research|investigate|verify|evidence)/i.test(prompt);
}

function hasResearchRequirements(state) {
  const req = state?.task_contract?.research_requirements;
  if (!req || typeof req !== 'object') return false;
  return [
    req.needs_internal_exploration,
    req.needs_primary_source_verification,
    req.needs_browser_observation
  ].some(Boolean);
}

function emitSystemMessage(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
}

function main() {
  const input = readInput();
  const state = loadState();
  const event = input?.hookEventName || '';

  if (event === 'UserPromptSubmit') {
    const prompt = input?.prompt || '';
    if (hasResearchIntent(prompt) && !hasResearchRequirements(state)) {
      emitSystemMessage(
        'Research-sensitive request detected. Run /research-decision first and set task_contract.research_requirements before implementation/review.'
      );
      return;
    }
  }

  if (event === 'Stop') {
    const req = state?.task_contract?.research_requirements;
    const anyRequired = hasResearchRequirements(state);
    const report = state?.research_state?.last_report || null;

    if (anyRequired && !report) {
      emitSystemMessage(
        'Research requirements were set but no research report was recorded in state.research_state.last_report. Add evidence source, confidence, and unknowns.'
      );
      return;
    }

    if (req?.needs_browser_observation && report && report.browser_unavailable === true && !report.remaining_uncertainty) {
      emitSystemMessage(
        'browser_unavailable is set but remaining_uncertainty is missing. Add remaining uncertainty for conditional verification.'
      );
      return;
    }
  }

  process.stdout.write('{}');
}

main();
