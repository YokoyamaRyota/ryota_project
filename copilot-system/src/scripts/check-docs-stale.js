#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const DOC_METADATA_KEYS = [
  "document_id",
  "classification",
  "status",
  "owner",
  "last_reviewed",
  "supersedes",
];

function resolveDocsRoot() {
  const candidates = [
    path.join(ROOT, "copilot-system", "docs"),
    path.join(ROOT, "docs"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

function resolveAuditLogPath() {
  const candidates = [
    path.join(ROOT, "copilot-system", "runtime", "audit_log", "events.jsonl"),
    path.join(ROOT, "audit_log", "events.jsonl"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

function parseArgs(argv) {
  let staleDays = 30;
  let includeReadme = true;
  let writeAudit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--days" && argv[i + 1]) {
      staleDays = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (arg.startsWith("--days=")) {
      staleDays = Number.parseInt(arg.slice("--days=".length), 10);
      continue;
    }
    if (arg === "--no-readme") {
      includeReadme = false;
      continue;
    }

    if (arg === "--write-audit") {
      writeAudit = true;
      continue;
    }
  }

  if (!Number.isInteger(staleDays) || staleDays <= 0) {
    staleDays = 30;
  }

  return { staleDays, includeReadme, writeAudit };
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

function collectMarkdownFiles(includeReadme) {
  const docsDir = resolveDocsRoot();
  const files = [];

  if (fs.existsSync(docsDir)) {
    const stack = [docsDir];
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
  }

  if (includeReadme) {
    const readmePath = path.join(ROOT, "README.md");
    if (fs.existsSync(readmePath)) {
      files.push(readmePath);
    }
  }

  return files.sort();
}

function daysBetween(nowMs, dateMs) {
  return Math.floor((nowMs - dateMs) / (1000 * 60 * 60 * 24));
}

function appendAuditEvents(result) {
  const auditPath = resolveAuditLogPath();
  const events = [];

  for (const item of result.stale) {
    events.push({
      event_id: crypto.randomUUID(),
      timestamp_utc: new Date().toISOString(),
      event_type: "DOC_STALE_DETECTED",
      status: "warn",
      reason: `stale document: ${item.file}`,
      payload: item,
    });
  }

  for (const item of result.metadata_missing) {
    events.push({
      event_id: crypto.randomUUID(),
      timestamp_utc: new Date().toISOString(),
      event_type: "DOC_METADATA_MISSING",
      status: "warn",
      reason: `metadata missing: ${item.file}`,
      payload: item,
    });
  }

  if (events.length === 0) {
    return 0;
  }

  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join("\n");
  fs.appendFileSync(auditPath, `${lines}\n`, "utf8");
  return events.length;
}

function main() {
  const { staleDays, includeReadme, writeAudit } = parseArgs(process.argv.slice(2));
  const now = Date.now();
  const files = collectMarkdownFiles(includeReadme);

  const stale = [];
  const missingMetadata = [];

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf8");
    const metadata = parseDocumentMetadata(content);

    const missing = DOC_METADATA_KEYS.filter((key) => !metadata[key]);
    if (missing.length > 0) {
      missingMetadata.push({ file: rel, missing });
      continue;
    }

    if (metadata.status !== "active") {
      continue;
    }

    const reviewedAt = Date.parse(metadata.last_reviewed);
    if (Number.isNaN(reviewedAt)) {
      missingMetadata.push({ file: rel, missing: ["last_reviewed(valid-date)"] });
      continue;
    }

    const ageDays = daysBetween(now, reviewedAt);
    if (ageDays > staleDays) {
      stale.push({ file: rel, age_days: ageDays, owner: metadata.owner, document_id: metadata.document_id });
    }
  }

  const result = {
    status: "ok",
    stale_days_threshold: staleDays,
    scanned_files: files.length,
    stale_count: stale.length,
    metadata_missing_count: missingMetadata.length,
    stale,
    metadata_missing: missingMetadata,
  };

  if (writeAudit) {
    const appended = appendAuditEvents(result);
    result.audit_events_appended = appended;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (missingMetadata.length > 0) {
    process.exitCode = 1;
  }
}

main();
