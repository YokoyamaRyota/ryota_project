#!/usr/bin/env node

import path from "node:path";
import {
  appendJsonl,
  buildIndexEnvelope,
  ensureDirectory,
  listJsonFiles,
  normalizeTopics,
  nowIso,
  parseArgs,
  readJson,
  resolveEntriesMap,
  safeReadJson,
  writeJson,
} from "./lib.mjs";

function usage() {
  return [
    "Usage: node scripts/memory/consolidate-memory.mjs [options]",
    "Options:",
    "  --source-l0 <path>         (default: memory/l0)",
    "  --target-l1 <path>         (default: memory/l1)",
    "  --target-l2 <path>         (default: memory/l2)",
    "  --changes-file <path>      (default: memory/changes.jsonl)",
    "  --dry-run",
  ].join("\n");
}

function groupByTopic(records) {
  const grouped = new Map();
  for (const record of records) {
    const topics = normalizeTopics(record.topics);
    const key = topics[0] ?? "general";
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(record);
  }
  return grouped;
}

function summarize(records, level, idPrefix) {
  const allTopics = new Set();
  const summaries = [];

  for (const record of records) {
    for (const topic of normalizeTopics(record.topics)) {
      allTopics.add(topic);
    }
    if (record.summary) {
      summaries.push(String(record.summary));
    }
  }

  return {
    id: `${idPrefix}-${Date.now()}`,
    memory_type: level === 1 ? "summary_l1" : "summary_l2",
    level,
    topics: [...allTopics],
    summary: summaries.slice(0, level === 1 ? 5 : 3).join(" | "),
    rationale: `Generated from ${records.length} L0 records`,
    provenance: {
      actor: "consolidate-memory",
      timestamp: nowIso(),
    },
    derives_from: records.map((record) => record.id).filter(Boolean),
    source_kind: "track_b",
  };
}

function writeSummary(targetDir, summary, dryRun) {
  const filePath = path.join(targetDir, `${summary.id}.json`);
  summary.source_file = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  if (!dryRun) {
    ensureDirectory(targetDir);
    writeJson(filePath, summary);
  }
  return filePath;
}

function toIndexEntry(summary) {
  return {
    id: String(summary.id),
    memory_type: String(summary.memory_type ?? "summary_l1"),
    level: Number(summary.level ?? 1),
    topics: normalizeTopics(summary.topics),
    summary: String(summary.summary ?? "").trim(),
    rationale: String(summary.rationale ?? "").trim() || null,
    classification: String(summary.classification ?? "").trim() || null,
    access_count: Number(summary.access_count ?? 0),
    last_accessed_at: summary.last_accessed_at ?? null,
    conflict: Boolean(summary.conflict ?? false),
    superseded_by: summary.superseded_by ?? null,
    retrieval_tier: String(summary.retrieval_tier ?? "summary"),
    source_file: String(summary.source_file ?? ""),
    source_kind: String(summary.source_kind ?? "track_b"),
    provenance: summary.provenance ?? { actor: "consolidate-memory", timestamp: nowIso() },
    derives_from: Array.isArray(summary.derives_from) ? summary.derives_from : [],
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const l0Files = listJsonFiles(options.sourceL0);
  const l0Records = l0Files.map((filePath) => readJson(filePath));
  const grouped = groupByTopic(l0Records);

  let l1Updated = 0;
  let l2Updated = 0;
  const indexUpdates = [];

  for (const [topic, records] of grouped.entries()) {
    if (records.length === 0) {
      continue;
    }

    const l1Summary = summarize(records, 1, `decisions-${topic}`);
    const l1File = writeSummary(options.targetL1, l1Summary, options.dryRun);
    indexUpdates.push(toIndexEntry(l1Summary));
    l1Updated += 1;

    if (records.length >= 3) {
      const l2Summary = summarize(records, 2, `strategy-${topic}`);
      const l2File = writeSummary(options.targetL2, l2Summary, options.dryRun);
      indexUpdates.push(toIndexEntry(l2Summary));
      l2Updated += 1;

      if (!options.dryRun) {
        appendJsonl(options.changesFile, {
          change_type: "consolidation",
          topic,
          l1_file: path.relative(process.cwd(), l1File).replace(/\\/g, "/"),
          l2_file: path.relative(process.cwd(), l2File).replace(/\\/g, "/"),
          created_at: nowIso(),
        });
      }
      continue;
    }

    if (!options.dryRun) {
      appendJsonl(options.changesFile, {
        change_type: "consolidation",
        topic,
        l1_file: path.relative(process.cwd(), l1File).replace(/\\/g, "/"),
        l2_file: null,
        created_at: nowIso(),
      });
    }
  }

  if (!options.dryRun && indexUpdates.length > 0) {
    const currentIndex = safeReadJson(options.indexFile, { version: "2.0", entries: {} });
    const entries = resolveEntriesMap(currentIndex);
    for (const update of indexUpdates) {
      entries[update.id] = update;
    }
    writeJson(options.indexFile, buildIndexEnvelope(entries, currentIndex));
  }

  const status = l0Records.length === 0 ? "skipped" : "ok";

  process.stdout.write(
    `${JSON.stringify({
      status,
      records_scanned: l0Records.length,
      l1_updated: l1Updated,
      l2_updated: l2Updated,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
