#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function resolveMemoryRoot() {
  const candidates = [
    path.resolve(process.cwd(), "copilot-system", "runtime", "memory"),
    path.resolve(process.cwd(), "memory"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

export function parseArgs(argv) {
  const defaultMemoryRoot = resolveMemoryRoot();
  const options = {
    decisionFile: undefined,
    evidenceFile: undefined,
    indexFile: path.join(defaultMemoryRoot, "index.json"),
    changesFile: path.join(defaultMemoryRoot, "changes.jsonl"),
    memoryRoot: defaultMemoryRoot,
    sourceL0: path.join(defaultMemoryRoot, "l0"),
    targetL1: path.join(defaultMemoryRoot, "l1"),
    targetL2: path.join(defaultMemoryRoot, "l2"),
    legacyRoot: path.join(defaultMemoryRoot, "legacy"),
    targetRoot: defaultMemoryRoot,
    output: undefined,
    query: "",
    topics: [],
    maxDepth: 3,
    tokenBudget: 8000,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--decision-file") {
      options.decisionFile = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--decision-file=")) {
      options.decisionFile = path.resolve(process.cwd(), arg.slice("--decision-file=".length));
      continue;
    }

    if (arg === "--evidence-file") {
      options.evidenceFile = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--evidence-file=")) {
      options.evidenceFile = path.resolve(process.cwd(), arg.slice("--evidence-file=".length));
      continue;
    }

    if (arg === "--index-file") {
      options.indexFile = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--index-file=")) {
      options.indexFile = path.resolve(process.cwd(), arg.slice("--index-file=".length));
      continue;
    }

    if (arg === "--changes-file") {
      options.changesFile = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--changes-file=")) {
      options.changesFile = path.resolve(process.cwd(), arg.slice("--changes-file=".length));
      continue;
    }

    if (arg === "--memory-root") {
      options.memoryRoot = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--memory-root=")) {
      options.memoryRoot = path.resolve(process.cwd(), arg.slice("--memory-root=".length));
      continue;
    }

    if (arg === "--source-l0") {
      options.sourceL0 = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--source-l0=")) {
      options.sourceL0 = path.resolve(process.cwd(), arg.slice("--source-l0=".length));
      continue;
    }

    if (arg === "--target-l1") {
      options.targetL1 = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--target-l1=")) {
      options.targetL1 = path.resolve(process.cwd(), arg.slice("--target-l1=".length));
      continue;
    }

    if (arg === "--target-l2") {
      options.targetL2 = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--target-l2=")) {
      options.targetL2 = path.resolve(process.cwd(), arg.slice("--target-l2=".length));
      continue;
    }

    if (arg === "--legacy-root") {
      options.legacyRoot = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--legacy-root=")) {
      options.legacyRoot = path.resolve(process.cwd(), arg.slice("--legacy-root=".length));
      continue;
    }

    if (arg === "--target-root") {
      options.targetRoot = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--target-root=")) {
      options.targetRoot = path.resolve(process.cwd(), arg.slice("--target-root=".length));
      continue;
    }

    if (arg === "--output") {
      options.output = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = path.resolve(process.cwd(), arg.slice("--output=".length));
      continue;
    }

    if (arg === "--query") {
      options.query = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg.startsWith("--query=")) {
      options.query = arg.slice("--query=".length);
      continue;
    }

    if (arg === "--topics") {
      options.topics = parseTopics(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg.startsWith("--topics=")) {
      options.topics = parseTopics(arg.slice("--topics=".length));
      continue;
    }

    if (arg === "--max-depth") {
      options.maxDepth = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (arg.startsWith("--max-depth=")) {
      options.maxDepth = Number.parseInt(arg.slice("--max-depth=".length), 10);
      continue;
    }

    if (arg === "--token-budget") {
      options.tokenBudget = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (arg.startsWith("--token-budget=")) {
      options.tokenBudget = Number.parseInt(arg.slice("--token-budget=".length), 10);
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseTopics(input) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureParentDirectory(filePath) {
  ensureDirectory(path.dirname(filePath));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function appendJsonl(filePath, value) {
  ensureParentDirectory(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export function safeReadJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  return readJson(filePath);
}

export function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name));
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeTopics(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

export function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function estimateTokens(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(source.length / 4);
}

export function resolveEntriesMap(indexData) {
  if (indexData && typeof indexData === "object" && indexData.entries && typeof indexData.entries === "object") {
    return { ...indexData.entries };
  }
  return {};
}

export function buildIndexEnvelope(entries, previous) {
  const memoryRoot = resolveMemoryRoot();
  const relative = (p) => path.relative(process.cwd(), p).replace(/\\/g, "/");
  return {
    version: "2.0",
    updated_at: nowIso(),
    entries,
    entry_template: previous?.entry_template ?? {
      id: "",
      memory_type: "decision",
      level: 0,
      topics: [],
      summary: "",
      access_count: 0,
      last_accessed_at: null,
      conflict: false,
      retrieval_tier: "summary",
    },
    policy: {
      l3: relative(path.join(memoryRoot, "core.md")),
      l2: relative(path.join(memoryRoot, "l2")),
      l1: relative(path.join(memoryRoot, "l1")),
      l0: relative(path.join(memoryRoot, "l0")),
      changes: relative(path.join(memoryRoot, "changes.jsonl")),
      legacy: relative(path.join(memoryRoot, "legacy")),
    },
  };
}
