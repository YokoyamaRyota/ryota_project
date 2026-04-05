/**
 * planner-cache-manager.js
 * 
 * Planner キャッシュ管理モジュール
 * - キャッシュ保存・取得
 * - TTL 24h 管理
 * - キャッシュ有効性判定
 */

const fs = require('fs');
const path = require('path');
const semanticHash = require('./planner-semantic-hash.js');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'planner');
const CACHE_INDEX_FILE = path.join(CACHE_DIR, 'index.json');

// TTL: 24 時間（マイリセコンド）
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * キャッシュディレクトリを初期化
 */
function ensureCacheDirectory() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * キャッシュインデックスを初期化・読み込み
 * @returns {Object} キャッシュインデックス
 */
function loadCacheIndex() {
  ensureCacheDirectory();

  if (fs.existsSync(CACHE_INDEX_FILE)) {
    return JSON.parse(fs.readFileSync(CACHE_INDEX_FILE, 'utf8'));
  }

  return {
    version: '1.0',
    created_at: new Date().toISOString(),
    entries: [] // { cache_key, semantic_hash, created_at, expires_at, file_path }
  };
}

/**
 * キャッシュインデックスを保存
 * @param {Object} index - キャッシュインデックス
 */
function saveCacheIndex(index) {
  ensureCacheDirectory();
  fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/**
 * 計画結果をキャッシュに保存
 * @param {Object} task_contract - タスク契約
 * @param {Object} execution_plan - 実行計画
 * @returns {Object} キャッシュ保存結果
 */
function savePlanToCache(task_contract, execution_plan) {
  const cache_key_obj = semanticHash.generateCacheKey(task_contract);
  const cache_key = cache_key_obj.cache_key;
  const semantic_hash = cache_key_obj.semantic_hash;

  const now = new Date().getTime();
  const expires_at = new Date(now + CACHE_TTL_MS).toISOString();

  const cache_entry = {
    cache_key: cache_key,
    semantic_hash: semantic_hash,
    task_contract: task_contract,
    execution_plan: execution_plan,
    created_at: new Date(now).toISOString(),
    expires_at: expires_at,
    metadata: cache_key_obj.metadata
  };

  // ファイルに保存
  const file_name = `${cache_key}.json`;
  const file_path = path.join(CACHE_DIR, file_name);
  fs.writeFileSync(file_path, JSON.stringify(cache_entry, null, 2), 'utf8');

  // インデックス更新
  const index = loadCacheIndex();
  const existing_idx = index.entries.findIndex(e => e.cache_key === cache_key);

  if (existing_idx >= 0) {
    index.entries[existing_idx] = {
      cache_key: cache_key,
      semantic_hash: semantic_hash,
      created_at: cache_entry.created_at,
      expires_at: expires_at,
      file_path: file_path
    };
  } else {
    index.entries.push({
      cache_key: cache_key,
      semantic_hash: semantic_hash,
      created_at: cache_entry.created_at,
      expires_at: expires_at,
      file_path: file_path
    });
  }

  saveCacheIndex(index);

  return {
    saved: true,
    cache_key: cache_key,
    semantic_hash: semantic_hash,
    expires_at: expires_at,
    file_path: file_path
  };
}

/**
 * キャッシュから計画を取得
 * @param {Object} task_contract - タスク契約
 * @returns {Object} { found: boolean, execution_plan, reusability }
 */
function getPlanFromCache(task_contract) {
  const index = loadCacheIndex();
  const semantic_hash = semanticHash.generateSemanticHash(task_contract);

  // インデックスから候補を探す
  const matching_entries = index.entries.filter(
    entry => entry.semantic_hash === semantic_hash
  );

  if (matching_entries.length === 0) {
    return {
      found: false,
      reason: 'No cache entry with matching semantic hash'
    };
  }

  for (const entry of matching_entries) {
    // TTL チェック
    const now = new Date().getTime();
    const expires_at_ms = new Date(entry.expires_at).getTime();

    if (now > expires_at_ms) {
      // TTL 切れ、ファイル削除
      if (fs.existsSync(entry.file_path)) {
        fs.unlinkSync(entry.file_path);
      }
      continue;
    }

    // ファイル読み込み
    if (fs.existsSync(entry.file_path)) {
      const cache_content = JSON.parse(fs.readFileSync(entry.file_path, 'utf8'));

      // must-have 変更検出
      const reusability = semanticHash.evaluateCacheReusability(
        task_contract,
        cache_content.task_contract
      );

      if (reusability.can_reuse || reusability.similarity >= 0.8) {
        return {
          found: true,
          execution_plan: cache_content.execution_plan,
          cached_at: cache_content.created_at,
          expires_at: entry.expires_at,
          reusability: reusability,
          cache_hit: reusability.similarity === 1.0
        };
      }
    }
  }

  return {
    found: false,
    reason: 'No valid cache entry (expired or low similarity)',
    candidates_checked: matching_entries.length
  };
}

/**
 * キャッシュを無効化（task_contract変更時）
 * @param {Object} task_contract - タスク契約
 * @returns {number} 削除されたキャッシュ数
 */
function invalidateCache(task_contract) {
  const semantic_hash = semanticHash.generateSemanticHash(task_contract);
  const index = loadCacheIndex();

  const to_delete = index.entries.filter(e => e.semantic_hash === semantic_hash);
  const deleted_count = to_delete.length;

  // ファイル削除
  for (const entry of to_delete) {
    if (fs.existsSync(entry.file_path)) {
      fs.unlinkSync(entry.file_path);
    }
  }

  // インデックス更新
  index.entries = index.entries.filter(e => e.semantic_hash !== semantic_hash);
  saveCacheIndex(index);

  return deleted_count;
}

/**
 * 期限切れキャッシュを削除
 * @returns {Object} { deleted_count, size_freed_mb }
 */
function cleanExpiredCache() {
  const index = loadCacheIndex();
  const now = new Date().getTime();

  let deleted_count = 0;
  let freed_bytes = 0;

  for (const entry of index.entries) {
    const expires_at_ms = new Date(entry.expires_at).getTime();

    if (now > expires_at_ms) {
      if (fs.existsSync(entry.file_path)) {
        const stat = fs.statSync(entry.file_path);
        freed_bytes += stat.size;
        fs.unlinkSync(entry.file_path);
      }
      deleted_count++;
    }
  }

  // 有効なエントリのみ保持
  index.entries = index.entries.filter(e => {
    const expires_at_ms = new Date(e.expires_at).getTime();
    return now <= expires_at_ms;
  });

  saveCacheIndex(index);

  return {
    deleted_count: deleted_count,
    size_freed_mb: (freed_bytes / (1024 * 1024)).toFixed(2),
    remaining_entries: index.entries.length
  };
}

/**
 * キャッシュ統計情報
 * @returns {Object} キャッシュ統計
 */
function getCacheStats() {
  const index = loadCacheIndex();
  const now = new Date().getTime();

  let total_size_bytes = 0;
  let valid_count = 0;
  let expired_count = 0;

  for (const entry of index.entries) {
    if (fs.existsSync(entry.file_path)) {
      const stat = fs.statSync(entry.file_path);
      total_size_bytes += stat.size;

      const expires_at_ms = new Date(entry.expires_at).getTime();
      if (now <= expires_at_ms) {
        valid_count++;
      } else {
        expired_count++;
      }
    }
  }

  return {
    total_entries: index.entries.length,
    valid_entries: valid_count,
    expired_entries: expired_count,
    total_size_mb: (total_size_bytes / (1024 * 1024)).toFixed(2),
    cache_dir: CACHE_DIR,
    index_file: CACHE_INDEX_FILE
  };
}

// エクスポート
module.exports = {
  savePlanToCache,
  getPlanFromCache,
  invalidateCache,
  cleanExpiredCache,
  getCacheStats,
  loadCacheIndex,
  saveCacheIndex,
  CACHE_DIR,
  CACHE_TTL_MS
};
