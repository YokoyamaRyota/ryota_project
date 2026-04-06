const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');

function candidatePaths(relativePaths) {
  return relativePaths.map(relativePath => path.join(WORKSPACE_ROOT, relativePath));
}

function pickExistingPath(relativePaths, fallbackRelativePath) {
  const candidates = candidatePaths(relativePaths);
  const existing = candidates.find(candidate => fs.existsSync(candidate));
  if (existing) {
    return existing;
  }
  return path.join(WORKSPACE_ROOT, fallbackRelativePath);
}

function resolveStateFile(fileName = 'current_task.json') {
  return pickExistingPath(
    [
      `copilot-system/runtime/state/${fileName}`,
      `state/${fileName}`,
    ],
    `copilot-system/runtime/state/${fileName}`,
  );
}

function resolveReviewReportFile() {
  return pickExistingPath(
    [
      'copilot-system/docs/reports/review-report.md',
      'review-report.md',
    ],
    'copilot-system/docs/reports/review-report.md',
  );
}

function resolveRuntimeDir(dirName) {
  return pickExistingPath(
    [
      `copilot-system/runtime/${dirName}`,
      `${dirName}`,
    ],
    `copilot-system/runtime/${dirName}`,
  );
}

function resolveAuditLogFile(fileName = 'events.jsonl') {
  const auditDir = resolveRuntimeDir('audit_log');
  return path.join(auditDir, fileName);
}

function resolveMemoryPath(relativePath = '') {
  const memoryRoot = resolveRuntimeDir('memory');
  return path.join(memoryRoot, relativePath);
}

function resolveWorkspaceRoot() {
  return WORKSPACE_ROOT;
}

module.exports = {
  resolveStateFile,
  resolveReviewReportFile,
  resolveRuntimeDir,
  resolveAuditLogFile,
  resolveMemoryPath,
  resolveWorkspaceRoot,
};
