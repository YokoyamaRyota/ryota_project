/**
 * memory-tiered-retriever.js
 * 
 * Memory Retriever: Tiered retrieval 実装
 * - Tier-1 Core: 常時ロード（2,000 トークン目標）
 * - Tier-2 Patterns: 関連度の高いパターン
 * - Tier-3 Episodes: 完了タスク記録
 * - Hybrid Retrieval: keyword × semantic 重み配分
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', '..', 'memory');
const TIER_1_FILE = path.join(MEMORY_DIR, 'core.md');
const TIER_2_DIR = path.join(MEMORY_DIR, 'patterns');
const TIER_3_DIR = path.join(MEMORY_DIR, 'episodes');
const MEMORY_INDEX = path.join(MEMORY_DIR, 'index.json');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function loadMemoryIndex() {
  const defaultIndex = { entries: {}, entry_template: {} };
  if (!fs.existsSync(MEMORY_INDEX)) {
    return defaultIndex;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_INDEX, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return defaultIndex;
    }
    return {
      entries: parsed.entries || {},
      entry_template: parsed.entry_template || {}
    };
  } catch {
    return defaultIndex;
  }
}

function writeMemoryIndex(index) {
  const current = loadMemoryIndex();
  const persisted = (() => {
    if (!fs.existsSync(MEMORY_INDEX)) return {};
    try {
      return JSON.parse(fs.readFileSync(MEMORY_INDEX, 'utf8'));
    } catch {
      return {};
    }
  })();

  const merged = {
    version: '1.0',
    updated_at: new Date().toISOString(),
    entries: index.entries || current.entries || {},
    entry_template: index.entry_template || current.entry_template || {},
    policy: persisted.policy || {
      tier_1: 'core.md',
      tier_2: 'memory/patterns',
      tier_3: 'memory/episodes',
      tier_4: 'memory/archive'
    }
  };

  fs.writeFileSync(MEMORY_INDEX, JSON.stringify(merged, null, 2), 'utf8');
}

/**
 * Tier-1 Core を読み込み
 * @returns {Object} { content: string, tokens: number }
 */
function loadTier1Core() {
  if (!fs.existsSync(TIER_1_FILE)) {
    return {
      content: '',
      tokens: 0,
      file_not_found: true
    };
  }

  const content = fs.readFileSync(TIER_1_FILE, 'utf8');
  const tokens = estimateTokens(content);

  return {
    content: content,
    tokens: tokens,
    loaded_at: new Date().toISOString()
  };
}

/**
 * トークン数を推定（簡易版）
 * @param {string} text - テキスト
 * @returns {number} 推定トークン数
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;

  const latinWords = (normalized.match(/[A-Za-z0-9_]+/g) || []).length;
  const cjkChars = (normalized.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;

  // CJK を含む文でも過小評価しないよう、文字種に応じて重みを分ける
  return Math.max(1, Math.ceil(latinWords * 1.3 + cjkChars * 0.8));
}

function extractQueryTokens(query, options = {}) {
  const minLatinLength = options.minLatinLength || 3;
  const cjkNgramMin = options.cjkNgramMin || 2;
  const cjkNgramMax = options.cjkNgramMax || 3;

  const normalized = (query || '').toLowerCase();
  const tokens = new Set();

  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    if (/[a-z0-9_]/.test(token) && token.length >= minLatinLength) {
      tokens.add(token);
    }
  }

  const cjkRuns = normalized.match(/[\u3040-\u30ff\u3400-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    if (run.length <= 3) {
      tokens.add(run);
      continue;
    }

    for (let n = cjkNgramMin; n <= cjkNgramMax; n++) {
      for (let i = 0; i <= run.length - n; i++) {
        tokens.add(run.slice(i, i + n));
      }
    }
  }

  return Array.from(tokens);
}

function tokenizeForSemantic(text) {
  const normalized = (text || '').toLowerCase();
  const tokens = new Set();

  for (const token of normalized.match(/[a-z0-9_]+/g) || []) {
    if (token.length >= 2) {
      tokens.add(token);
    }
  }

  const cjkRuns = normalized.match(/[\u3040-\u30ff\u3400-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    if (run.length <= 2) {
      tokens.add(run);
      continue;
    }

    for (let i = 0; i < run.length - 1; i++) {
      tokens.add(run.slice(i, i + 2));
    }
  }

  return tokens;
}

function trimTextToTokenBudget(text, maxTokens) {
  if (!text || maxTokens <= 0) return '';
  const originalTokens = estimateTokens(text);
  if (originalTokens <= maxTokens) return text;

  let candidateLength = Math.max(80, Math.floor(text.length * (maxTokens / originalTokens)));
  let candidate = `${text.slice(0, candidateLength)}\n...[truncated]`;

  while (estimateTokens(candidate) > maxTokens && candidateLength > 40) {
    candidateLength = Math.floor(candidateLength * 0.9);
    candidate = `${text.slice(0, candidateLength)}\n...[truncated]`;
  }

  return candidate;
}

function estimateQueryComplexity(query) {
  const q = (query || '').trim();
  if (!q) return 0;

  const terms = q.split(/\s+/).filter(Boolean);
  const uniqueTerms = new Set(terms.map(t => t.toLowerCase())).size;
  const hasTimeIntent = /(before|after|during|between|\d{4}|今日|昨日|明日|先週|今月|期限|日時)/i.test(q);
  const hasLogicalIntent = /(and|or|not|except|比較|矛盾|関連|要約|因果|影響)/i.test(q);
  const longQueryBoost = q.length > 120 ? 1 : 0;

  const base = clamp(uniqueTerms / 20, 0, 1);
  const intentBoost = (hasTimeIntent ? 0.2 : 0) + (hasLogicalIntent ? 0.2 : 0) + (longQueryBoost ? 0.2 : 0);
  return clamp(base + intentBoost, 0, 1);
}

function buildContextPacket(candidate, remainingTokens, options = {}) {
  const fullThreshold = options.fullThreshold || 0.8;
  const score = options.score || 0;
  const id = candidate.id || candidate.task_id || candidate.file_name || 'unknown';
  const raw = candidate.content || candidate.summary || '';

  if (!raw) {
    return {
      ...candidate,
      context_tier: 'reference',
      context_payload: `[REF] ${id}`,
      context_tokens: estimateTokens(`[REF] ${id}`)
    };
  }

  if (score >= fullThreshold && remainingTokens >= 500) {
    const tokens = estimateTokens(raw);
    return {
      ...candidate,
      context_tier: 'full',
      context_payload: raw,
      context_tokens: tokens
    };
  }

  if (remainingTokens >= 100) {
    const summary = raw.slice(0, 500);
    const tokens = estimateTokens(summary);
    return {
      ...candidate,
      context_tier: 'summary',
      context_payload: summary,
      context_tokens: tokens
    };
  }

  const ref = `[REF] ${id}: ${raw.slice(0, 120).replace(/\n/g, ' ')}`;
  return {
    ...candidate,
    context_tier: 'reference',
    context_payload: ref,
    context_tokens: estimateTokens(ref)
  };
}

/**
 * Tier-2 Patterns インデックスを読み込み
 * @returns {Array} パターンリスト
 */
function loadTier2Patterns() {
  if (!fs.existsSync(TIER_2_DIR)) {
    return {
      patterns: [],
      index_not_found: true
    };
  }

  const memoryIndex = loadMemoryIndex();
  const files = fs.readdirSync(TIER_2_DIR).filter(f => f.endsWith('.md'));
  const patterns = files.map((file) => {
    const filePath = path.join(TIER_2_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const id = file.replace(/\.md$/i, '');
    const indexMeta = memoryIndex.entries[id] || {};
    return {
      id,
      name: file,
      content,
      created_at: fs.statSync(filePath).mtime.toISOString(),
      specificity: indexMeta.specificity || 1.0,
      access_count: indexMeta.access_count || 0,
      confidence: indexMeta.confidence || 0.7,
      provenance: indexMeta.provenance || {
        source: 'memory/patterns',
        timestamp: null,
        derivation: null
      },
      derives_from: indexMeta.derives_from || [],
      superseded_by: indexMeta.superseded_by || null
    };
  });

  return {
    patterns,
    metadata: {
      source: 'memory/patterns/*.md',
      files_loaded: files.length
    }
  };
}

/**
 * Tier-3 Episodes を読み込み
 * @returns {Array} エピソードリスト
 */
function loadTier3Episodes() {
  if (!fs.existsSync(TIER_3_DIR)) {
    return {
      episodes: [],
      directory_not_found: true
    };
  }

  const memoryIndex = loadMemoryIndex();
  const files = fs.readdirSync(TIER_3_DIR).filter(f => f.endsWith('.md'));
  const episodes = files.map(file => {
    const task_id = file.replace(/\.md$/, '');
    const file_path = path.join(TIER_3_DIR, file);
    const content = readFileSafe(file_path, '');
    const indexMeta = memoryIndex.entries[task_id] || {};
    return {
      file_name: file,
      task_id,
      file_path,
      created_at: fs.statSync(file_path).birthtime.toISOString(),
      content,
      specificity: indexMeta.specificity || 1.0,
      access_count: indexMeta.access_count || 0,
      confidence: indexMeta.confidence || 0.7,
      provenance: indexMeta.provenance || {
        source: 'memory/episodes',
        timestamp: null,
        derivation: null
      },
      derives_from: indexMeta.derives_from || [],
      superseded_by: indexMeta.superseded_by || null
    };
  });

  return {
    episodes: episodes,
    total_episodes: episodes.length
  };
}

/**
 * 関連度スコアリング（keyword ベース）
 * @param {string} text - テキスト
 * @param {string[]} keywords - キーワード
 * @returns {number} スコア (0.0～1.0)
 */
function scoreByKeywords(text, keywords) {
  if (keywords.length === 0) return 0;

  const text_lower = text.toLowerCase();
  let matched = 0;

  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    if (text_lower.includes(keywordLower)) {
      matched++;
    }
  }

  return matched / keywords.length;
}

/**
 * Semantic 類似度スコアリング（簡易版）
 * @param {string} text - テキスト
 * @param {string} query - クエリ
 * @returns {number} スコア (0.0～1.0)
 */
function scoreBySemanticSimilarity(text, query) {
  const text_words = tokenizeForSemantic(text);
  const query_words = tokenizeForSemantic(query);

  const intersection = Array.from(query_words).filter(w => text_words.has(w)).length;
  const union = new Set([...text_words, ...query_words]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Hybrid Retrieval: keyword と semantic の重み配分
 * @param {Object} patterns - パターンリスト
 * @param {string} query - クエリ
 * @param {Object} options - { keyword_weight: 0.6, semantic_weight: 0.4, top_k: 5 }
 * @returns {Array} スコア付きパターン
 */
function hybridRetrieval(patterns, query, options = {}) {
  const keyword_weight = options.keyword_weight || 0.6;
  const semantic_weight = options.semantic_weight || 0.4;
  const top_k = options.top_k || 5;

  // キーワード抽出（query からの主要単語）
  const keywords = extractQueryTokens(query, { minLatinLength: 3 });

  // 各パターンをスコリング
  const scored_patterns = patterns.map(pattern => {
    const content = pattern.content || pattern.name || '';
    const keyword_score = scoreByKeywords(content, keywords);
    const semantic_score = scoreBySemanticSimilarity(content, query);

    const hybrid_score = keyword_weight * keyword_score + semantic_weight * semantic_score;

    return {
      ...pattern,
      scores: {
        keyword: keyword_score,
        semantic: semantic_score,
        hybrid: hybrid_score
      }
    };
  });

  // スコアでソート
  scored_patterns.sort((a, b) => b.scores.hybrid - a.scores.hybrid);

  // Top K を返す
  return scored_patterns.slice(0, top_k);
}

/**
 * 競合解決（複数の関連パターンがある場合）
 * @param {Array} candidates - 候補パターン
 * @param {Object} options - { prefer_recent: true, prefer_specificity: true }
 * @returns {Array} 優先度付きソート済みパターン
 */
function resolveConflicts(candidates, options = {}) {
  const prefer_recent = options.prefer_recent !== false;
  const prefer_specificity = options.prefer_specificity !== false;

  return candidates.sort((a, b) => {
    // 1. Timestamp: 最新優先
    if (prefer_recent) {
      const time_a = new Date(a.created_at || a.timestamp || 0).getTime();
      const time_b = new Date(b.created_at || b.timestamp || 0).getTime();
      if (time_a !== time_b) {
        return time_b - time_a; // 降順（最新が先）
      }
    }

    // 2. 特異性: より具体的なもの優先
    if (prefer_specificity) {
      const specificity_a = (a.specificity || 0);
      const specificity_b = (b.specificity || 0);
      if (specificity_a !== specificity_b) {
        return specificity_b - specificity_a;
      }
    }

    // 3. Access count: よく使われたもの優先
    const access_a = (a.access_count || 0);
    const access_b = (b.access_count || 0);
    return access_b - access_a;
  });
}

/**
 * Memory 予算制御（context window 上限）
 * @param {Array} candidates - 候補パターン
 * @param {number} max_tokens - 最大トークン数
 * @returns {Array} 予算内のパターン
 */
function applyBudgetControl(candidates, max_tokens) {
  let total_tokens = 0;
  const selected = [];

  for (const candidate of candidates) {
    const tokens = estimateTokens(candidate.context_payload || candidate.content || candidate.name || '');
    if (total_tokens + tokens <= max_tokens) {
      total_tokens += tokens;
      selected.push({ ...candidate, context_tokens: tokens });
    } else {
      break; // 予算オーバー時は以降を除外
    }
  }

  return selected;
}

/**
 * 完全な Tiered Retrieval フロー
 * @param {string} query - クエリ（ユーザー要求等）
 * @param {Object} config - 設定
 * @returns {Object} { tier_1, tier_2, tier_3, total_tokens, retrieval_plan }
 */
function performTieredRetrieval(query, config = {}) {
  const max_tier1_tokens = config.max_tier1_tokens || 2000;
  const max_tier2_tokens = config.max_tier2_tokens || 1500;
  const max_tier3_tokens = config.max_tier3_tokens || 500;
  const base_top_k = config.base_top_k || 8;
  const complexity_delta = config.complexity_delta || 0.8;
  const tier2_pattern_weight = config.tier2_pattern_weight || 0.6; // known_pattern
  const tier2_new_capability_weight = config.tier2_new_capability_weight || 0.4; // new_capability
  const complexity_score = estimateQueryComplexity(query);
  const dynamic_top_k = clamp(Math.round(base_top_k * (1 + complexity_delta * complexity_score)), 3, 20);

  const retrieval_plan = {
    timestamp: new Date().toISOString(),
    query: query,
    complexity: {
      score: complexity_score,
      base_top_k,
      dynamic_top_k
    },
    stages: []
  };

  // Stage 1: Tier-1 Core を読み込み（常時）
  const tier1Raw = loadTier1Core();
  const tier1Content = trimTextToTokenBudget(tier1Raw.content || '', max_tier1_tokens);
  const tier1 = {
    ...tier1Raw,
    content: tier1Content,
    tokens: estimateTokens(tier1Content),
    truncated: estimateTokens(tier1Content) < (tier1Raw.tokens || 0)
  };
  retrieval_plan.stages.push({
    stage: 'Tier-1 Core',
    status: 'loaded',
    tokens: tier1.tokens,
    truncated: !!tier1.truncated,
    original_tokens: tier1Raw.tokens || 0
  });

  // Stage 2: Tier-2 Patterns
  const tier2_data = loadTier2Patterns();
  let tier2_selected = [];

  if (!tier2_data.index_not_found) {
    // Hybrid retrieval を実行
    const scored = hybridRetrieval(tier2_data.patterns, query, {
      keyword_weight: tier2_pattern_weight,
      semantic_weight: tier2_new_capability_weight,
      top_k: dynamic_top_k
    });

    // 競合解決
    const resolved = resolveConflicts(scored);

    let tier2Remaining = max_tier2_tokens;
    const tieredPackets = resolved.map((p) => {
      const packet = buildContextPacket(p, tier2Remaining, { score: p.scores?.hybrid || 0 });
      tier2Remaining -= packet.context_tokens;
      return packet;
    });

    // 予算制御
    tier2_selected = applyBudgetControl(tieredPackets, max_tier2_tokens);
  }

  retrieval_plan.stages.push({
    stage: 'Tier-2 Patterns',
    status: 'retrieved',
    candidates_total: tier2_data.patterns.length,
    candidates_selected: tier2_selected.length,
    tokens: tier2_selected.reduce((sum, p) => sum + (p.context_tokens || 0), 0)
  });

  // Stage 3: Tier-3 Episodes
  const tier3_data = loadTier3Episodes();
  let tier3_selected = [];

  if (!tier3_data.directory_not_found) {
    const episodeKeywords = extractQueryTokens(query, { minLatinLength: 2 });
    // 関連 episode を検索
    const scored = tier3_data.episodes.map(ep => ({
      ...ep,
      score: scoreByKeywords(`${ep.task_id} ${ep.content}`, episodeKeywords)
    }));

    const resolved = resolveConflicts(scored);
    let tier3Remaining = max_tier3_tokens;
    const tieredPackets = resolved.map((ep) => {
      const packet = buildContextPacket(ep, tier3Remaining, { score: ep.score || 0 });
      tier3Remaining -= packet.context_tokens;
      return packet;
    });
    tier3_selected = applyBudgetControl(tieredPackets, max_tier3_tokens);
  }

  retrieval_plan.stages.push({
    stage: 'Tier-3 Episodes',
    status: 'retrieved',
    candidates_total: tier3_data.total_episodes || 0,
    candidates_selected: tier3_selected.length,
    tokens: tier3_selected.reduce((sum, p) => sum + (p.context_tokens || 0), 0)
  });

  // 総トークン数計算
  const total_tokens = tier1.tokens +
    tier2_selected.reduce((sum, p) => sum + (p.context_tokens || 0), 0) +
    tier3_selected.reduce((sum, p) => sum + (p.context_tokens || 0), 0);

  const tierSummary = {
    full: 0,
    summary: 0,
    reference: 0
  };

  for (const item of [...tier2_selected, ...tier3_selected]) {
    if (item.context_tier && tierSummary[item.context_tier] !== undefined) {
      tierSummary[item.context_tier] += 1;
    }
  }

  // Batch index updates: collect all items then write once
  const indexUpdates = {};
  for (const pattern of tier2_selected) {
    indexUpdates[pattern.id || pattern.name || 'unknown-pattern'] = {
      confidence: pattern.confidence,
      provenance: pattern.provenance,
      derives_from: pattern.derives_from,
      superseded_by: pattern.superseded_by,
      retrieval_tier: pattern.context_tier || 'reference'
    };
  }
  for (const episode of tier3_selected) {
    indexUpdates[episode.task_id || episode.file_name || 'unknown-episode'] = {
      confidence: episode.confidence,
      provenance: episode.provenance,
      derives_from: episode.derives_from,
      superseded_by: episode.superseded_by,
      retrieval_tier: episode.context_tier || 'reference'
    };
  }
  if (Object.keys(indexUpdates).length > 0) {
    batchUpdateMemoryIndex(indexUpdates);
  }

  return {
    tier_1: {
      content: tier1.content,
      tokens: tier1.tokens
    },
    tier_2: {
      selected: tier2_selected,
      count: tier2_selected.length
    },
    tier_3: {
      selected: tier3_selected,
      count: tier3_selected.length
    },
    context_tier_summary: tierSummary,
    total_tokens: total_tokens,
    retrieval_plan: retrieval_plan
  };
}

/**
 * Memory Index の1件を in-memory の index オブジェクトへ適用（ファイル書き込みなし）
 * @param {object} index - loadMemoryIndex() で得た index オブジェクト（破壊的変更）
 * @param {string} resource_id
 * @param {object} metadata
 */
function applyIndexEntry(index, resource_id, metadata = {}) {
  const template = index.entry_template || {};

  if (!index.entries[resource_id]) {
    index.entries[resource_id] = {
      ...template,
      resource_id,
      access_count: 0,
      last_accessed_at: null,
      specificity: 1.0,
      confidence: 0.7,
      provenance: {
        source: 'unknown',
        timestamp: null,
        derivation: null
      },
      derives_from: [],
      superseded_by: null,
      retrieval_tier: 'reference'
    };
  }

  index.entries[resource_id].access_count++;
  index.entries[resource_id].last_accessed_at = new Date().toISOString();
  if (typeof metadata.specificity === 'number') {
    index.entries[resource_id].specificity = metadata.specificity;
  }
  if (typeof metadata.confidence === 'number') {
    index.entries[resource_id].confidence = clamp(metadata.confidence, 0, 1);
  }
  if (metadata.provenance && typeof metadata.provenance === 'object') {
    index.entries[resource_id].provenance = {
      ...index.entries[resource_id].provenance,
      ...metadata.provenance
    };
  }
  if (Array.isArray(metadata.derives_from)) {
    index.entries[resource_id].derives_from = metadata.derives_from;
  }
  if (typeof metadata.superseded_by === 'string' || metadata.superseded_by === null) {
    index.entries[resource_id].superseded_by = metadata.superseded_by;
  }
  if (typeof metadata.retrieval_tier === 'string') {
    index.entries[resource_id].retrieval_tier = metadata.retrieval_tier;
  }
}

/**
 * Memory Index を更新（access_count / specificity）- 1件ずつ即時書き込み
 * @param {string} resource_id - リソース ID
 */
function updateMemoryIndex(resource_id, metadata = {}) {
  const index = loadMemoryIndex();
  applyIndexEntry(index, resource_id, metadata);
  writeMemoryIndex(index);
}

/**
 * Memory Index を複数件まとめて更新（fileI/O は1回のみ）
 * @param {Object.<string, object>} updates - { resource_id: metadata } のマップ
 */
function batchUpdateMemoryIndex(updates) {
  const index = loadMemoryIndex();
  for (const [resource_id, metadata] of Object.entries(updates)) {
    applyIndexEntry(index, resource_id, metadata);
  }
  writeMemoryIndex(index);
}

// エクスポート
module.exports = {
  loadTier1Core,
  loadTier2Patterns,
  loadTier3Episodes,
  scoreByKeywords,
  scoreBySemanticSimilarity,
  hybridRetrieval,
  resolveConflicts,
  applyBudgetControl,
  performTieredRetrieval,
  updateMemoryIndex,
  batchUpdateMemoryIndex,
  estimateTokens,
  estimateQueryComplexity,
  extractQueryTokens
};
