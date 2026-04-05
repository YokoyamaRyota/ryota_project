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
const crypto = require('crypto');

const MEMORY_DIR = path.join(__dirname, '..', '..', 'memory');
const TIER_1_FILE = path.join(MEMORY_DIR, 'core.md');
const TIER_2_DIR = path.join(MEMORY_DIR, 'patterns');
const TIER_3_DIR = path.join(MEMORY_DIR, 'episodes');
const MEMORY_INDEX = path.join(MEMORY_DIR, 'index.json');

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
  // 単純な推定: 単語数の 1.3 倍（GPT-3 tokenizer 近似）
  const word_count = text.split(/\s+/).length;
  return Math.ceil(word_count * 1.3);
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

  const files = fs.readdirSync(TIER_2_DIR).filter(f => f.endsWith('.md'));
  const patterns = files.map((file) => {
    const filePath = path.join(TIER_2_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      id: file.replace(/\.md$/i, ''),
      name: file,
      content,
      created_at: fs.statSync(filePath).mtime.toISOString(),
      specificity: 1.0,
      access_count: 0
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

  const files = fs.readdirSync(TIER_3_DIR).filter(f => f.endsWith('.md'));
  const episodes = files.map(file => ({
    file_name: file,
    task_id: file.replace(/\.md$/, ''),
    file_path: path.join(TIER_3_DIR, file),
    created_at: fs.statSync(path.join(TIER_3_DIR, file)).birthtime.toISOString()
  }));

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
    if (text_lower.includes(keyword.toLowerCase())) {
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
  // 簡易版: 単語の重複度を計算
  const text_words = new Set(text.toLowerCase().split(/\s+/));
  const query_words = new Set(query.toLowerCase().split(/\s+/));

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
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3); // 3 文字以上のみ

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
    const tokens = estimateTokens(candidate.content || candidate.name || '');
    if (total_tokens + tokens <= max_tokens) {
      total_tokens += tokens;
      selected.push(candidate);
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
  const tier2_pattern_weight = config.tier2_pattern_weight || 0.6; // known_pattern
  const tier2_new_capability_weight = config.tier2_new_capability_weight || 0.4; // new_capability

  const retrieval_plan = {
    timestamp: new Date().toISOString(),
    query: query,
    stages: []
  };

  // Stage 1: Tier-1 Core を読み込み（常時）
  const tier1 = loadTier1Core();
  retrieval_plan.stages.push({
    stage: 'Tier-1 Core',
    status: 'loaded',
    tokens: tier1.tokens
  });

  // Stage 2: Tier-2 Patterns
  const tier2_data = loadTier2Patterns();
  let tier2_selected = [];

  if (!tier2_data.index_not_found) {
    // Hybrid retrieval を実行
    const scored = hybridRetrieval(tier2_data.patterns, query, {
      keyword_weight: tier2_pattern_weight,
      semantic_weight: tier2_new_capability_weight,
      top_k: 10
    });

    // 競合解決
    const resolved = resolveConflicts(scored);

    // 予算制御
    tier2_selected = applyBudgetControl(resolved, max_tier2_tokens);
  }

  retrieval_plan.stages.push({
    stage: 'Tier-2 Patterns',
    status: 'retrieved',
    candidates_total: tier2_data.patterns.length,
    candidates_selected: tier2_selected.length,
    tokens: tier2_selected.reduce((sum, p) => sum + (p.scores?.tokens || 0), 0)
  });

  // Stage 3: Tier-3 Episodes
  const tier3_data = loadTier3Episodes();
  let tier3_selected = [];

  if (!tier3_data.directory_not_found) {
    // 関連 episode を検索
    const scored = tier3_data.episodes.map(ep => ({
      ...ep,
      score: scoreByKeywords(ep.task_id, query.split(/\s+/))
    }));

    const resolved = resolveConflicts(scored);
    tier3_selected = applyBudgetControl(resolved, max_tier3_tokens);
  }

  retrieval_plan.stages.push({
    stage: 'Tier-3 Episodes',
    status: 'retrieved',
    candidates_total: tier3_data.total_episodes || 0,
    candidates_selected: tier3_selected.length,
    tokens: tier3_selected.reduce((sum, p) => sum + estimateTokens(fs.readFileSync(p.file_path, 'utf8')), 0)
  });

  // 総トークン数計算
  const total_tokens = tier1.tokens +
    tier2_selected.reduce((sum, p) => sum + (p.scores?.tokens || 0), 0) +
    tier3_selected.reduce((sum, p) => sum + estimateTokens(fs.readFileSync(p.file_path, 'utf8')), 0);

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
    total_tokens: total_tokens,
    retrieval_plan: retrieval_plan
  };
}

/**
 * Memory Index を更新（access_count / specificity）
 * @param {string} resource_id - リソース ID
 */
function updateMemoryIndex(resource_id) {
  let index = { entries: {} };

  if (fs.existsSync(MEMORY_INDEX)) {
    index = JSON.parse(fs.readFileSync(MEMORY_INDEX, 'utf8'));
  }

  if (!index.entries[resource_id]) {
    index.entries[resource_id] = {
      resource_id: resource_id,
      access_count: 0,
      last_accessed_at: null,
      specificity: 1.0
    };
  }

  index.entries[resource_id].access_count++;
  index.entries[resource_id].last_accessed_at = new Date().toISOString();

  fs.writeFileSync(MEMORY_INDEX, JSON.stringify(index, null, 2), 'utf8');
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
  estimateTokens
};
