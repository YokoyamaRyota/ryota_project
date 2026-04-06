#!/usr/bin/env node

import path from "node:path";
import {
  buildIndexEnvelope,
  listJsonFiles,
  normalizeTopics,
  parseArgs,
  readJson,
  writeJson,
} from "./lib.mjs";

function usage() {
  return [
    "Usage: node scripts/memory/build-memory-index.mjs [options]",
    "Options:",
    "  --memory-root <path>       (default: memory)",
    "  --output <path>            (default: memory/index.json)",
  ].join("\n");
}

function readMemoryRecords(memoryRoot) {
  const sources = [
    { dir: path.join(memoryRoot, "l0"), type: "l0" },
    { dir: path.join(memoryRoot, "l1"), type: "l1" },
    { dir: path.join(memoryRoot, "l2"), type: "l2" },
  ];

  const records = [];
  for (const source of sources) {
    for (const filePath of listJsonFiles(source.dir)) {
      const item = readJson(filePath);
      records.push({
        id: String(item.id ?? path.basename(filePath, ".json")),
        memory_type: String(item.memory_type ?? (source.type === "l0" ? "decision" : `summary_${source.type}`)),
        level: Number(item.level ?? (source.type === "l0" ? 0 : source.type === "l1" ? 1 : 2)),
        topics: normalizeTopics(item.topics),
        summary: String(item.summary ?? "").trim(),
        rationale: String(item.rationale ?? "").trim() || null,
        classification: String(item.classification ?? "").trim() || null,
        access_count: Number(item.access_count ?? 0),
        last_accessed_at: item.last_accessed_at ?? null,
        conflict: Boolean(item.conflict ?? false),
        superseded_by: item.superseded_by ?? null,
        retrieval_tier: String(item.retrieval_tier ?? "summary"),
        source_file: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
        source_kind: String(item.source_kind ?? "track_c"),
        provenance: item.provenance ?? { actor: "build-memory-index", timestamp: null },
        derives_from: Array.isArray(item.derives_from) ? item.derives_from : [],
      });
    }
  }

  return records;
}

function appendCore(memoryRoot, records) {
  records.push({
    id: "core-l3",
    memory_type: "core",
    level: 3,
    topics: ["core"],
    summary: "L3 core memory",
    rationale: null,
    classification: null,
    access_count: 0,
    last_accessed_at: null,
    conflict: false,
    superseded_by: null,
    retrieval_tier: "summary",
    source_file: path.relative(process.cwd(), path.join(memoryRoot, "core.md")).replace(/\\/g, "/"),
    source_kind: "track_b",
    provenance: { actor: "build-memory-index", timestamp: null },
    derives_from: [],
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const outputPath = options.output ?? path.join(options.memoryRoot, "index.json");
  const records = readMemoryRecords(options.memoryRoot);
  appendCore(options.memoryRoot, records);

  const entries = {};
  for (const record of records) {
    if (entries[record.id]) {
      throw new Error(`duplicate memory id detected: ${record.id}`);
    }
    entries[record.id] = record;
  }

  const indexData = buildIndexEnvelope(entries, null);
  writeJson(outputPath, indexData);

  process.stdout.write(
    `${JSON.stringify({ status: "ok", output: outputPath, entries: Object.keys(entries).length })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
