#!/usr/bin/env node

import { estimateTokens, normalizeText, normalizeTopics, parseArgs, readJson } from "./lib.mjs";

function usage() {
  return [
    "Usage: node scripts/memory/retrieve-memory.mjs [options]",
    "Options:",
    "  --index-file <path>        (default: memory/index.json)",
    "  --query <text>",
    "  --topics <a,b,c>",
    "  --max-depth <1|2|3>        (default: 3)",
    "  --token-budget <int>       (default: 8000)",
  ].join("\n");
}

function jaccard(aTopics, bTopics) {
  const a = new Set(aTopics);
  const b = new Set(bTopics);
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeRecency(lastAccessedAt) {
  if (!lastAccessedAt) {
    return 0;
  }
  const timestamp = Date.parse(lastAccessedAt);
  if (Number.isNaN(timestamp)) {
    return 0;
  }
  const ageMs = Date.now() - timestamp;
  const maxAgeMs = 1000 * 60 * 60 * 24 * 90;
  return Math.max(0, 1 - ageMs / maxAgeMs);
}

function normalizeAccess(accessCount) {
  const capped = Math.max(0, Math.min(Number(accessCount || 0), 10));
  return capped / 10;
}

function scoreEntry(entry, queryTopics) {
  const topicOverlap = jaccard(normalizeTopics(entry.topics), queryTopics);
  const recency = normalizeRecency(entry.last_accessed_at);
  const access = normalizeAccess(entry.access_count);
  return 0.5 * topicOverlap + 0.3 * recency + 0.2 * access;
}

function estimateEntryTokens(entry) {
  return estimateTokens(`${entry.summary} ${entry.rationale ?? ""} ${JSON.stringify(entry.topics ?? [])}`);
}

function sortedCandidates(entries, level, queryTopics) {
  return entries
    .filter((entry) => entry.level === level)
    .map((entry) => ({ ...entry, candidate_score: scoreEntry(entry, queryTopics) }))
    .sort((a, b) => b.candidate_score - a.candidate_score);
}

function selectWithinBudget(candidates, budget) {
  const selected = [];
  let used = 0;
  for (const candidate of candidates) {
    const tokens = estimateEntryTokens(candidate);
    if (used + tokens > budget) {
      continue;
    }
    selected.push({
      memory_id: candidate.id,
      candidate_score: Number(candidate.candidate_score.toFixed(3)),
      tokens,
      summary: candidate.summary,
    });
    used += tokens;
  }
  return { selected, used };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const index = readJson(options.indexFile);
  const entries = Object.values(index.entries ?? {});

  const queryTopics = normalizeTopics([
    ...options.topics,
    ...normalizeText(options.query).split(" "),
  ]);

  const l3 = entries.find((entry) => entry.level === 3) ?? null;
  const l3Tokens = l3 ? estimateEntryTokens(l3) : 0;

  // Reserve at least 50% budget for current-task context.
  const memoryBudgetCap = Math.floor(options.tokenBudget * 0.5);
  // Memory payload should stay within 20% unless only shallow/medium context is requested.
  const memorySafetyCap = Math.floor(options.tokenBudget * 0.2);
  const availableBudget = Math.max(
    0,
    Math.min(options.tokenBudget - l3Tokens, memoryBudgetCap),
  );
  const l2Candidates = sortedCandidates(entries, 2, queryTopics);
  const l1Candidates = options.maxDepth >= 2 ? sortedCandidates(entries, 1, queryTopics) : [];
  const l0Candidates = options.maxDepth >= 3 ? sortedCandidates(entries, 0, queryTopics) : [];

  const l2Result = selectWithinBudget(l2Candidates.slice(0, 5), Math.floor(availableBudget * 0.35));
  const l1Result = selectWithinBudget(l1Candidates.slice(0, 5), Math.floor(availableBudget * 0.35));

  const usedWithoutL0 = l3Tokens + l2Result.used + l1Result.used;
  const remaining = Math.max(0, availableBudget - l2Result.used - l1Result.used);

  let l0Budget = Math.floor(remaining * 0.8);
  if (options.maxDepth >= 3 && usedWithoutL0 >= memorySafetyCap) {
    l0Budget = 0;
  }
  const l0Result = selectWithinBudget(l0Candidates.slice(0, 5), l0Budget);

  let finalL0 = l0Result;
  if (options.maxDepth >= 3 && usedWithoutL0 + l0Result.used > memorySafetyCap) {
    finalL0 = { selected: [], used: 0 };
  }

  const response = {
    l3_core: l3
      ? {
          memory_id: l3.id,
          tokens: l3Tokens,
          summary: l3.summary,
        }
      : null,
    l2_strategies: l2Result.selected,
    l1_decisions: l1Result.selected,
    l0_records: finalL0.selected,
    budget_used: l3Tokens + l2Result.used + l1Result.used + finalL0.used,
    budget_total: options.tokenBudget,
    truncated: options.maxDepth >= 3 && finalL0.selected.length < Math.min(5, l0Candidates.length),
  };

  process.stdout.write(`${JSON.stringify(response)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
