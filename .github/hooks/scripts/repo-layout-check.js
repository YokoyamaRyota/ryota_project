const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

const ALLOWED_ROOT_ENTRIES = new Set([
  '.git',
  '.github',
  '.vscode',
  'copilot-system',
  'package.json',
  'README.md',
]);

const FORBIDDEN_PATH_MARKERS = [
  'mcp/',
  'manifests/',
  'packaging/',
  'scripts/install-plan.mjs',
  'scripts/install-apply.mjs',
  'scripts/install-validate.mjs',
  'scripts/list-installables.mjs',
  'scripts/build-mcp-config.js',
  'scripts/build-release-package.ps1'
];

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function extractToolName(payload) {
  return payload?.tool_name || payload?.toolName || '';
}

function extractToolInput(payload) {
  return payload?.tool_input || payload?.toolInput || {};
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function relativeFromRoot(absOrRel) {
  const normalized = normalizeSlashes(absOrRel);
  if (!normalized) return '';

  const rootNorm = normalizeSlashes(ROOT);
  if (normalized.toLowerCase().startsWith(rootNorm.toLowerCase())) {
    const rel = normalized.slice(rootNorm.length).replace(/^\/+/, '');
    return rel;
  }

  return normalized.replace(/^\/+/, '');
}

function getCandidatePaths(toolName, input) {
  const candidates = [];

  const directKeys = ['filePath', 'path', 'new_path', 'old_path', 'destination', 'source'];
  for (const key of directKeys) {
    if (typeof input?.[key] === 'string') {
      candidates.push(input[key]);
    }
  }

  if (toolName === 'apply_patch' && typeof input?.input === 'string') {
    const matches = input.input.match(/\*\*\* (?:Add|Update|Delete) File: (.+)/g) || [];
    for (const line of matches) {
      const pathPart = line.replace(/^\*\*\* (?:Add|Update|Delete) File: /, '').trim();
      candidates.push(pathPart);
    }
  }

  return candidates.map(relativeFromRoot).filter(Boolean);
}

function isForbiddenPath(relPath) {
  const normalized = normalizeSlashes(relPath).toLowerCase();
  return FORBIDDEN_PATH_MARKERS.some(marker => normalized.includes(marker.toLowerCase()));
}

function blocksUnexpectedRootCreation(relPath) {
  const normalized = normalizeSlashes(relPath);
  if (!normalized || normalized.includes('/')) {
    return false;
  }

  return !ALLOWED_ROOT_ENTRIES.has(normalized);
}

function main() {
  const payload = readStdinJson();
  const toolName = extractToolName(payload);
  const toolInput = extractToolInput(payload);

  const guardedTools = new Set(['create_file', 'apply_patch', 'edit', 'write']);
  if (!guardedTools.has(toolName)) {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    return;
  }

  const candidates = getCandidatePaths(toolName, toolInput);

  for (const relPath of candidates) {
    if (isForbiddenPath(relPath)) {
      process.stdout.write(JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: `REPO_LAYOUT_FORBIDDEN_PATH: ${relPath}`
      }));
      return;
    }

    if (blocksUnexpectedRootCreation(relPath)) {
      process.stdout.write(JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: `REPO_LAYOUT_ROOT_DENY: ${relPath}`
      }));
      return;
    }
  }

  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
}

main();
