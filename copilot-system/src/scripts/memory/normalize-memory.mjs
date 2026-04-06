#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import {
  appendJsonl,
  buildIndexEnvelope,
  normalizeText,
  normalizeTopics,
  parseArgs,
  resolveEntriesMap,
  safeReadJson,
  writeJson,
} from "./lib.mjs";

function usage() {
  return [
    "Usage: node scripts/memory/normalize-memory.mjs [options]",
    "Options:",
    "  --decision-file <path>",
    "  --evidence-file <path>",
    "  --index-file <path>        (default: memory/index.json)",
    "  --changes-file <path>      (default: memory/changes.jsonl)",
    "  --dry-run",
  ].join("\n");
}

function block(reason) {
  return {
    status: "blocked",
    reason,
    action: "noop",
    index_updated: false,
  };
}

function stableHash(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function validateCandidate(candidate) {
  const required = ["id", "memory_type", "level", "summary", "topics", "provenance"];
  for (const key of required) {
    if (!(key in candidate)) {
      return `missing required key: ${key}`;
    }
  }
  if (!Array.isArray(candidate.topics)) {
    return "topics must be an array";
  }
  if (typeof candidate.provenance !== "object" || candidate.provenance === null) {
    return "provenance must be an object";
  }
  return null;
}

function findContradiction(entries, candidate) {
  if (candidate.memory_type !== "decision") {
    return null;
  }

  const candidateTopics = new Set(normalizeTopics(candidate.topics));
  const candidateSummary = normalizeText(candidate.summary);

  for (const value of Object.values(entries)) {
    if (value.id === candidate.id || value.memory_type !== "decision") {
      continue;
    }

    const existingTopics = new Set(normalizeTopics(value.topics));
    const overlap = [...candidateTopics].some((topic) => existingTopics.has(topic));
    if (!overlap) {
      continue;
    }

    const existingSummary = normalizeText(value.summary);
    if (existingSummary && candidateSummary && existingSummary !== candidateSummary) {
      return value;
    }
  }

  return null;
}

function buildEntry(candidate) {
  const summary = String(candidate.summary ?? "").trim();
  return {
    id: String(candidate.id),
    memory_type: String(candidate.memory_type),
    level: Number(candidate.level),
    topics: normalizeTopics(candidate.topics),
    summary,
    rationale: String(candidate.rationale ?? "").trim() || null,
    classification: String(candidate.classification ?? "").trim() || null,
    access_count: Number(candidate.access_count ?? 0),
    last_accessed_at: candidate.last_accessed_at ?? null,
    conflict: Boolean(candidate.conflict ?? false),
    superseded_by: candidate.superseded_by ?? null,
    retrieval_tier: String(candidate.retrieval_tier ?? "summary"),
    source_file: String(candidate.source_file ?? ""),
    source_kind: String(candidate.source_kind ?? "track_c"),
    provenance: candidate.provenance,
    derives_from: Array.isArray(candidate.derives_from) ? candidate.derives_from : [],
    fingerprint: stableHash(JSON.stringify({
      summary,
      topics: normalizeTopics(candidate.topics),
      rationale: candidate.rationale ?? null,
      classification: candidate.classification ?? null,
    })),
  };
}

function loadCandidate(options) {
  const hasDecision = Boolean(options.decisionFile);
  const hasEvidence = Boolean(options.evidenceFile);
  if (hasDecision === hasEvidence) {
    throw new Error("exactly one of --decision-file or --evidence-file must be provided");
  }

  const targetFile = options.decisionFile ?? options.evidenceFile;
  if (!fs.existsSync(targetFile)) {
    throw new Error(`file not found: ${targetFile}`);
  }

  const payload = JSON.parse(fs.readFileSync(targetFile, "utf8"));
  if (!payload.source_file) {
    payload.source_file = targetFile;
  }

  if (!payload.memory_type) {
    payload.memory_type = hasDecision ? "decision" : "evidence";
  }

  if (payload.level === undefined || payload.level === null) {
    payload.level = 0;
  }

  return payload;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const candidate = loadCandidate(options);
  const validationError = validateCandidate(candidate);
  if (validationError) {
    process.stdout.write(`${JSON.stringify(block(validationError))}\n`);
    process.exit(0);
  }

  const currentIndex = safeReadJson(options.indexFile, { version: "2.0", entries: {} });
  const entries = resolveEntriesMap(currentIndex);
  const nextEntry = buildEntry(candidate);
  const currentEntry = entries[nextEntry.id] ?? null;

  let action = "add";
  if (currentEntry) {
    if (currentEntry.fingerprint === nextEntry.fingerprint) {
      action = "noop";
    } else {
      action = "update";
    }
  }

  const contradictionWith = findContradiction(entries, nextEntry);
  if (contradictionWith) {
    action = "contradiction";
    nextEntry.conflict = true;
  }

  const result = {
    status: "ok",
    action,
    index_updated: action !== "noop",
  };

  if (!options.dryRun && action !== "noop") {
    entries[nextEntry.id] = nextEntry;
    const nextIndex = buildIndexEnvelope(entries, currentIndex);
    writeJson(options.indexFile, nextIndex);

    if (action === "contradiction" && contradictionWith) {
      appendJsonl(options.changesFile, {
        change_type: "contradiction",
        old_decision_id: contradictionWith.id,
        new_decision_id: nextEntry.id,
        topic: nextEntry.topics[0] ?? "unknown",
        description: `Potential contradiction between ${contradictionWith.id} and ${nextEntry.id}`,
        acknowledged: false,
        source_kind: nextEntry.source_kind,
        created_at: new Date().toISOString(),
      });
    }
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const result = block(error.message);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
