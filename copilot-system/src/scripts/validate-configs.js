#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MODE = resolveMode(process.argv.slice(2));
const issues = [];
const warnings = [];
const DOC_METADATA_KEYS = [
  "document_id",
  "classification",
  "status",
  "owner",
  "last_reviewed",
  "supersedes",
];
const STALE_DAYS = 30;
const ALLOWED_ROOT_ENTRIES = new Set([
  ".git",
  ".github",
  ".vscode",
  "copilot-system",
  "package.json",
  "README.md",
]);

function resolveDocsRoot() {
  const candidates = [
    path.join(ROOT, "copilot-system", "docs"),
    path.join(ROOT, "docs"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

function resolveSourceSkillsRoot() {
  const candidates = [
    path.join(ROOT, "copilot-system", "src", "skills"),
    path.join(ROOT, "skills"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

function resolveMode(args) {
  const modeFlag = args.find((arg) => arg.startsWith("--mode="));
  let mode = "enforce";

  if (modeFlag) {
    mode = modeFlag.slice("--mode=".length);
  } else {
    const modeIndex = args.indexOf("--mode");
    if (modeIndex !== -1 && args[modeIndex + 1]) {
      mode = args[modeIndex + 1];
    }
  }

  const validModes = new Set(["dry-run", "warn", "enforce"]);
  return validModes.has(mode) ? mode : "enforce";
}

function recordIssue(message) {
  issues.push(message);
}

function recordWarning(message) {
  warnings.push(message);
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    recordIssue(`missing file: ${path.relative(ROOT, filePath)}`);
    return false;
  }
  return true;
}

function readJson(filePath) {
  if (!ensureFile(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    recordIssue(`invalid JSON in ${path.relative(ROOT, filePath)}: ${error.message}`);
    return null;
  }
}

function ensureTomlLike(filePath, requiredTokens) {
  if (!ensureFile(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const token of requiredTokens) {
    if (!content.includes(token)) {
      recordIssue(`${path.relative(ROOT, filePath)} is missing expected token: ${token}`);
    }
  }
}

function ensurePathMissing(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (fs.existsSync(fullPath)) {
    recordIssue(`forbidden path exists in local mode: ${relativePath}`);
  }
}

function ensureScriptMissing(scripts, scriptName) {
  if (Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
    recordIssue(`forbidden script exists in package.json: ${scriptName}`);
  }
}

function ensureRootAllowlist() {
  const entries = fs.readdirSync(ROOT);
  for (const entry of entries) {
    if (!ALLOWED_ROOT_ENTRIES.has(entry)) {
      recordIssue(`unexpected root entry in local mode: ${entry}`);
    }
  }
}

function normalizeText(content) {
  return content.replace(/\r\n/g, "\n").trimEnd();
}

function ensureSkillSync(skillName) {
  const sourceFile = path.join(resolveSourceSkillsRoot(), skillName, "SKILL.md");
  const generatedFile = path.join(ROOT, ".github", "skills", skillName, "SKILL.md");
  if (!ensureFile(sourceFile) || !ensureFile(generatedFile)) {
    return;
  }

  const source = normalizeText(fs.readFileSync(sourceFile, "utf8"));
  const generated = normalizeText(fs.readFileSync(generatedFile, "utf8"));
  if (source !== generated) {
    recordIssue(`skill drift detected: skills/${skillName}/SKILL.md`);
  }
}

function parseDocumentMetadata(content) {
  const lines = content.split(/\r?\n/);
  const metadata = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }
    const payload = line.slice(2);
    const separatorIndex = payload.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = payload.slice(0, separatorIndex).trim();
    const value = payload.slice(separatorIndex + 1).trim();
    if (DOC_METADATA_KEYS.includes(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function listMarkdownFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function getMetadataValidationTargets() {
  const targets = listMarkdownFilesRecursive(resolveDocsRoot());
  const readmePath = path.join(ROOT, "README.md");
  if (fs.existsSync(readmePath)) {
    targets.push(readmePath);
  }
  return targets;
}

function validateDocumentMetadata(filePath) {
  if (!ensureFile(filePath)) {
    return;
  }

  const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
  const content = fs.readFileSync(filePath, "utf8");
  const metadata = parseDocumentMetadata(content);

  for (const key of DOC_METADATA_KEYS) {
    if (!metadata[key]) {
      recordIssue(`missing doc metadata in ${relativePath}: ${key}`);
    }
  }

  const classification = metadata.classification;
  if (classification && classification !== "normative" && classification !== "informative") {
    recordIssue(`invalid classification in ${relativePath}: ${classification}`);
  }

  const status = metadata.status;
  if (status && status !== "draft" && status !== "active" && status !== "deprecated") {
    recordIssue(`invalid status in ${relativePath}: ${status}`);
  }

  const lastReviewed = metadata.last_reviewed;
  if (lastReviewed) {
    const parsed = Date.parse(lastReviewed);
    if (Number.isNaN(parsed)) {
      recordIssue(`invalid last_reviewed in ${relativePath}: ${lastReviewed}`);
    } else if (status === "active") {
      const ageDays = Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
      if (ageDays > STALE_DAYS) {
        recordWarning(`stale active document (> ${STALE_DAYS} days): ${relativePath}`);
      }
    }
  }
}

ensureFile(path.join(ROOT, ".github", "copilot-instructions.md"));
ensureFile(path.join(ROOT, ".github", "agents", "explorer.agent.md"));
ensureFile(path.join(ROOT, ".github", "agents", "reviewer.agent.md"));
ensureFile(path.join(ROOT, ".github", "agents", "docs-researcher.agent.md"));
ensureFile(path.join(ROOT, ".github", "instructions", "skill-authoring.instructions.md"));
ensureFile(path.join(ROOT, ".github", "instructions", "installer.instructions.md"));
ensureFile(path.join(ROOT, ".github", "prompts", "verify-copilot-customizations.prompt.md"));
ensureFile(path.join(ROOT, ".github", "prompts", "add-skill.prompt.md"));

const skillDirs = fs
  .readdirSync(resolveSourceSkillsRoot(), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const skillName of skillDirs) {
  ensureFile(path.join(resolveSourceSkillsRoot(), skillName, "SKILL.md"));
  ensureFile(path.join(ROOT, ".github", "skills", skillName, "SKILL.md"));
  ensureSkillSync(skillName);
}

ensureRootAllowlist();

// Local slim mode guard: deleted distribution/integration assets must not reappear.
const forbiddenPaths = [
  "mcp",
  "manifests",
  "packaging",
  "scripts/build-mcp-config.js",
  "scripts/install-plan.mjs",
  "scripts/install-apply.mjs",
  "scripts/install-validate.mjs",
  "scripts/list-installables.mjs",
  "scripts/build-release-package.ps1",
  "scripts/memory/migrate-memory.mjs",
];
for (const relativePath of forbiddenPaths) {
  ensurePathMissing(relativePath);
}

const packageJson = readJson(path.join(ROOT, "package.json"));
const scripts = packageJson?.scripts ?? {};
const forbiddenScripts = [
  "build:mcp-config",
  "validate:mcp",
  "install:plan",
  "install:apply",
  "install:validate",
  "install:list",
  "memory:migrate",
];
for (const scriptName of forbiddenScripts) {
  ensureScriptMissing(scripts, scriptName);
}

for (const filePath of getMetadataValidationTargets()) {
  validateDocumentMetadata(filePath);
}

if (warnings.length > 0) {
  for (const message of warnings) {
    console.warn(`Warn: ${message}`);
  }
}

if (issues.length > 0) {
  const level = MODE === "enforce" ? "Error" : "Warn";
  for (const message of issues) {
    console.error(`${level}: ${message}`);
  }

  if (MODE === "enforce") {
    process.exit(1);
  }

  console.log(`Config validation completed in ${MODE} mode with ${issues.length} issue(s).`);
  process.exit(0);
}

console.log(`Config validation passed (local mode, mode=${MODE}).`);
