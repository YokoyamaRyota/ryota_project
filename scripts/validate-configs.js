#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${path.relative(ROOT, filePath)}`);
  }
}

function readJson(filePath) {
  ensureFile(filePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`invalid JSON in ${path.relative(ROOT, filePath)}: ${error.message}`);
  }
}

function ensureTomlLike(filePath, requiredTokens) {
  ensureFile(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  for (const token of requiredTokens) {
    if (!content.includes(token)) {
      fail(`${path.relative(ROOT, filePath)} is missing expected token: ${token}`);
    }
  }
}

function runNodeScript(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    fail(stderr || stdout || `command failed: node ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

readJson(path.join(ROOT, "mcp", "catalog.json"));
for (const fileName of fs.readdirSync(path.join(ROOT, "mcp", "profiles")).filter((name) => name.endsWith(".json"))) {
  readJson(path.join(ROOT, "mcp", "profiles", fileName));
}

readJson(path.join(ROOT, "manifests", "install-components.json"));
readJson(path.join(ROOT, "manifests", "install-profiles.json"));
readJson(path.join(ROOT, "manifests", "install-modules.json"));
ensureFile(path.join(ROOT, "plugins", "copilot", "templates", "copilot-instructions.md"));
ensureFile(path.join(ROOT, "plugins", "copilot", "templates", "agents", "explorer.agent.md"));
ensureFile(path.join(ROOT, "plugins", "copilot", "templates", "agents", "reviewer.agent.md"));
ensureFile(path.join(ROOT, "plugins", "copilot", "templates", "agents", "docs-researcher.agent.md"));
ensureFile(path.join(ROOT, ".github", "copilot-instructions.md"));
ensureFile(path.join(ROOT, ".github", "agents", "explorer.agent.md"));
ensureFile(path.join(ROOT, ".github", "agents", "reviewer.agent.md"));
ensureFile(path.join(ROOT, ".github", "agents", "docs-researcher.agent.md"));
ensureFile(path.join(ROOT, ".github", "instructions", "skill-authoring.instructions.md"));
ensureFile(path.join(ROOT, ".github", "instructions", "installer.instructions.md"));
ensureFile(path.join(ROOT, ".github", "prompts", "verify-copilot-customizations.prompt.md"));
ensureFile(path.join(ROOT, ".github", "prompts", "add-skill.prompt.md"));

const skillDirs = fs
  .readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const skillName of skillDirs) {
  ensureFile(path.join(ROOT, "skills", skillName, "SKILL.md"));
  ensureFile(path.join(ROOT, ".github", "skills", skillName, "SKILL.md"));
}

const mcpValidation = runNodeScript(["scripts/build-mcp-config.js", "--validate"]);
const installValidation = runNodeScript(["scripts/install-validate.mjs", "--profile", "copilot", "--target", "copilot"]);

console.log("Config validation passed.");
console.log(mcpValidation);
console.log(installValidation);
