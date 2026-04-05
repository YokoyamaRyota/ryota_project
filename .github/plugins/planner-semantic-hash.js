/**
 * planner-semantic-hash.js
 * 
 * Planner キャッシュ用セマンティックハッシュ生成
 * task_contract のセマンティックコンテンツからハッシュを生成し、
 * 重要な変更（must-have フィールド等）を検出
 */

const crypto = require('crypto');

/**
 * Semantic hash を生成（task_contract ベース）
 * @param {Object} task_contract - タスク契約オブジェクト
 * @returns {string} SHA256 semantic_hash
 */
function generateSemanticHash(task_contract) {
  // 重要なフィールドを抽出（must-have のみ）
  const essence = extractEssence(task_contract);

  // JSON 正規化（キー順序・空白の統一）
  const normalized = JSON.stringify(essence, Object.keys(essence).sort());

  // SHA256 ハッシュ生成
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
}

/**
 * task_contract から必須エッセンス (must-have) を抽出
 * @param {Object} task_contract
 * @returns {Object} essence
 */
function extractEssence(task_contract) {
  return {
    goal: task_contract.goal,
    constraints: task_contract.constraints, // must-have: 必須制約
    done_criteria: task_contract.done_criteria, // must-have: 完了条件
    complexity_class: getComplexityClass(task_contract),
    risk_level: detectRiskLevel(task_contract)
  };
}

/**
 * 複雑度クラスを判定
 * @param {Object} task_contract
 * @returns {string} simple | medium | complex
 */
function getComplexityClass(task_contract) {
  const constraints = task_contract.constraints || [];
  const criteria = task_contract.done_criteria || [];
  const total_items = constraints.length + criteria.length;

  if (total_items <= 3) return 'simple';
  if (total_items <= 7) return 'medium';
  return 'complex';
}

/**
 * リスクレベル検出
 * @param {Object} task_contract
 * @returns {string} low | medium | high
 */
function detectRiskLevel(task_contract) {
  const high_risk_keywords = ['authentication', 'authorization', 'payment', 'billing', 'security', 'data_integrity'];
  const goal_lower = (task_contract.goal || '').toLowerCase();

  const has_high_risk = high_risk_keywords.some(keyword => goal_lower.includes(keyword));
  if (has_high_risk) return 'high';

  const constraints = task_contract.constraints || [];
  if (constraints.length > 5) return 'medium';

  return 'low';
}

/**
 * 2 つのセマンティックハッシュが同一か確認
 * @param {string} hash1
 * @param {string} hash2
 * @returns {boolean}
 */
function isSameSemanticHash(hash1, hash2) {
  return hash1 === hash2;
}

/**
 * must-have フィールド変更を検出
 * @param {Object} task_contract_old - 古いコントラクト
 * @param {Object} task_contract_new - 新しいコントラクト
 * @returns {Object} { changed: boolean, changes: [] }
 */
function detectMustHaveChanges(task_contract_old, task_contract_new) {
  const changes = [];
  const must_have_fields = ['goal', 'constraints', 'done_criteria', 'acceptance_tests'];

  for (const field of must_have_fields) {
    const old_value = JSON.stringify(task_contract_old[field] || null);
    const new_value = JSON.stringify(task_contract_new[field] || null);

    if (old_value !== new_value) {
      changes.push({
        field: field,
        old: task_contract_old[field],
        new: task_contract_new[field]
      });
    }
  }

  return {
    changed: changes.length > 0,
    changes: changes
  };
}

/**
 * キャッシュ キーを生成（semantic_hash + metadata）
 * @param {Object} task_contract
 * @returns {Object} { cache_key, semantic_hash, metadata }
 */
function generateCacheKey(task_contract) {
  const semantic_hash = generateSemanticHash(task_contract);
  const complexity = getComplexityClass(task_contract);
  const risk_level = detectRiskLevel(task_contract);

  const cache_key = `plan_${semantic_hash.substring(0, 8)}_${complexity}_${risk_level}`;

  return {
    cache_key: cache_key,
    semantic_hash: semantic_hash,
    metadata: {
      complexity: complexity,
      risk_level: risk_level,
      source_task_id: task_contract.task_id || null
    }
  };
}

/**
 * キャッシュ再利用候補者を判定
 * @param {Object} task_contract_current - 現在のコントラクト
 * @param {Object} cached_contract - キャッシュされたコントラクト
 * @returns {Object} { can_reuse: boolean, reason: string, similarity: number }
 */
function evaluateCacheReusability(task_contract_current, cached_contract) {
  const current_hash = generateSemanticHash(task_contract_current);
  const cached_hash = generateSemanticHash(cached_contract);

  const is_same_hash = isSameSemanticHash(current_hash, cached_hash);
  const must_have_changes = detectMustHaveChanges(cached_contract, task_contract_current);

  if (is_same_hash && !must_have_changes.changed) {
    return {
      can_reuse: true,
      reason: 'Semantic hash match + no must-have changes',
      similarity: 1.0
    };
  }

  // 部分的な再利用可能性を計算（similarity スコア）
  const essence_current = extractEssence(task_contract_current);
  const essence_cached = extractEssence(cached_contract);

  const matching_fields = Object.keys(essence_current).filter(
    key => JSON.stringify(essence_current[key]) === JSON.stringify(essence_cached[key])
  );

  const similarity = matching_fields.length / Object.keys(essence_current).length;

  let can_reuse = false;
  let reason = '';

  if (similarity >= 0.8) {
    can_reuse = true;
    reason = `High similarity (${(similarity * 100).toFixed(1)}%). Can reuse with minor adjustments.`;
  } else if (similarity >= 0.5) {
    can_reuse = false;
    reason = `Moderate similarity (${(similarity * 100).toFixed(1)}%). Partial reuse not recommended.`;
  } else {
    can_reuse = false;
    reason = `Low similarity (${(similarity * 100).toFixed(1)}%). Cache not suitable for reuse.`;
  }

  return {
    can_reuse: can_reuse,
    reason: reason,
    similarity: similarity
  };
}

// エクスポート
module.exports = {
  generateSemanticHash,
  extractEssence,
  getComplexityClass,
  detectRiskLevel,
  isSameSemanticHash,
  detectMustHaveChanges,
  generateCacheKey,
  evaluateCacheReusability
};
