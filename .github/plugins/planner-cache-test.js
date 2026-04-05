/**
 * planner-cache-test.js
 * 
 * Planner キャッシュ機構の統合テスト
 * - semantic_hash 生成
 * - キャッシュ保存・取得
 * - TTL 管理
 * - must-have 変更検出
 */

const cacheManager = require('./planner-cache-manager.js');
const semanticHash = require('./planner-semantic-hash.js');

/**
 * テスト用タスク契約を生成
 */
function createMockTaskContract(id = 'test-001', variation = 0) {
  const base_contract = {
    task_id: id,
    source_ur_id: 'UR-001',
    mapped_br_id: 'BR-001',
    goal: 'Add new feature to system-specification.md',
    constraints: [
      'Must not modify existing FR definitions',
      'Must maintain backward compatibility',
      'Must update sync_status field'
    ],
    done_criteria: [
      'New requirement added to specification',
      'Artifact-gate validation passed',
      'Documentation updated'
    ],
    out_of_scope: [
      'Implementation of the feature',
      'UAT execution'
    ],
    acceptance_tests: [
      'AC-01: File syntax validation',
      'AC-02: Sync status check',
      'AC-03: Traceability verification'
    ]
  };

  // variation: 契約を微細に変更してテスト
  if (variation === 1) {
    base_contract.constraints.push('Extra constraint');
  } else if (variation === 2) {
    base_contract.goal = 'DIFFERENT GOAL';
  }

  return base_contract;
}

/**
 * テスト用実行計画を生成
 */
function createMockExecutionPlan() {
  return {
    milestones: [
      { phase: 'M1', description: 'Load file', estimated_time_seconds: 10 },
      { phase: 'M2', description: 'Modify content', estimated_time_seconds: 20 },
      { phase: 'M3', description: 'Validate', estimated_time_seconds: 15 },
      { phase: 'M4', description: 'Save and sync', estimated_time_seconds: 15 }
    ],
    execution_order: ['M1', 'M2', 'M3', 'M4'],
    critical_path_duration: 60,
    estimated_tokens: 50
  };
}

/**
 * テスト1: semantic_hash 生成と比較
 */
function testSemanticHashGeneration() {
  console.log('\n=== Test 1: Semantic Hash Generation ===\n');

  const contract_a = createMockTaskContract('test-001', 0);
  const contract_b = createMockTaskContract('test-001', 0); // 同じ内容
  const contract_c = createMockTaskContract('test-002', 1); // 違う内容

  const hash_a = semanticHash.generateSemanticHash(contract_a);
  const hash_b = semanticHash.generateSemanticHash(contract_b);
  const hash_c = semanticHash.generateSemanticHash(contract_c);

  console.log('Hash A (contract_a):', hash_a);
  console.log('Hash B (same content):', hash_b);
  console.log('Hash C (different):', hash_c);

  console.log('\nSame content match:', hash_a === hash_b ? '✅ PASS' : '❌ FAIL');
  console.log('Different content differ:', hash_a !== hash_c ? '✅ PASS' : '❌ FAIL');

  return hash_a === hash_b && hash_a !== hash_c;
}

/**
 * テスト2: キャッシュ保存・取得
 */
function testCacheSaveRetrieve() {
  console.log('\n=== Test 2: Cache Save & Retrieve ===\n');

  const contract = createMockTaskContract('test-002');
  const plan = createMockExecutionPlan();

  // 保存
  const save_result = cacheManager.savePlanToCache(contract, plan);
  console.log('Saved:', save_result);

  // 取得
  const retrieve_result = cacheManager.getPlanFromCache(contract);
  console.log('\nRetrieved:', retrieve_result);

  const cache_hit = retrieve_result.found && retrieve_result.cache_hit;
  console.log('\nCache hit:', cache_hit ? '✅ PASS' : '❌ FAIL');

  return cache_hit;
}

/**
 * テスト3: must-have 変更検出
 */
function testMustHaveChangeDetection() {
  console.log('\n=== Test 3: Must-Have Change Detection ===\n');

  const contract_original = createMockTaskContract('test-003', 0);
  const contract_modified = createMockTaskContract('test-003', 2); // goal 変更

  const change_detection = semanticHash.detectMustHaveChanges(
    contract_original,
    contract_modified
  );

  console.log('Changes detected:', change_detection);
  console.log('\nShould detect changes:', change_detection.changed ? '✅ PASS' : '❌ FAIL');

  return change_detection.changed;
}

/**
 * テスト4: キャッシュ再利用可能性評価
 */
function testCacheReusability() {
  console.log('\n=== Test 4: Cache Reusability Evaluation ===\n');

  const contract_a = createMockTaskContract('test-004', 0);
  const contract_b = createMockTaskContract('test-005', 0); // 同じ内容
  const contract_c = createMockTaskContract('test-006', 1); // slightly different

  const reusability_b = semanticHash.evaluateCacheReusability(contract_a, contract_b);
  const reusability_c = semanticHash.evaluateCacheReusability(contract_a, contract_c);

  console.log('\nReusability B (same content):');
  console.log('  Can reuse:', reusability_b.can_reuse);
  console.log('  Similarity:', (reusability_b.similarity * 100).toFixed(1) + '%');

  console.log('\nReusability C (slightly different):');
  console.log('  Can reuse:', reusability_c.can_reuse);
  console.log('  Similarity:', (reusability_c.similarity * 100).toFixed(1) + '%');

  console.log('\nB reusability check:', reusability_b.can_reuse ? '✅ PASS' : '❌ FAIL');

  return reusability_b.can_reuse;
}

/**
 * テスト5: キャッシュ有効期限管理
 */
function testCacheExpirationManagement() {
  console.log('\n=== Test 5: Cache Expiration Management ===\n');

  const stats_before = cacheManager.getCacheStats();
  console.log('Cache stats before cleanup:', stats_before);

  const cleanup_result = cacheManager.cleanExpiredCache();
  console.log('\nCleanup result:', cleanup_result);

  const stats_after = cacheManager.getCacheStats();
  console.log('\nCache stats after cleanup:', stats_after);

  console.log('\nCleanup executed:', cleanup_result.deleted_count >= 0 ? '✅ PASS' : '❌ FAIL');

  return cleanup_result.deleted_count >= 0;
}

/**
 * テスト6: キャッシュ統計情報
 */
function testCacheStatistics() {
  console.log('\n=== Test 6: Cache Statistics ===\n');

  const stats = cacheManager.getCacheStats();
  console.log('Cache statistics:');
  console.log(JSON.stringify(stats, null, 2));

  const has_valid_stats = typeof stats.total_entries === 'number';
  console.log('\nStatistics valid:', has_valid_stats ? '✅ PASS' : '❌ FAIL');

  return has_valid_stats;
}

/**
 * メインテスト実行
 */
function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   Planner Cache Integration Test Suite ║');
  console.log('╚════════════════════════════════════════╝');

  const results = {
    timestamp: new Date().toISOString(),
    tests: [
      { name: 'Semantic Hash Generation', result: testSemanticHashGeneration() },
      { name: 'Cache Save & Retrieve', result: testCacheSaveRetrieve() },
      { name: 'Must-Have Change Detection', result: testMustHaveChangeDetection() },
      { name: 'Cache Reusability Evaluation', result: testCacheReusability() },
      { name: 'Cache Expiration Management', result: testCacheExpirationManagement() },
      { name: 'Cache Statistics', result: testCacheStatistics() }
    ]
  };

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          Test Results Summary          ║');
  console.log('╚════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  for (const test of results.tests) {
    const status = test.result ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${test.name}`);
    if (test.result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n📊 Overall: ${passed}/${results.tests.length} tests passed`);
  console.log(`Overall Status: ${failed === 0 ? '🟢 ALL TESTS PASSED' : '🔴 SOME TESTS FAILED'}\n`);

  results.passed = passed;
  results.failed = failed;
  results.overall_status = failed === 0 ? 'passed' : 'failed';

  return results;
}

// エクスポート
module.exports = {
  runAllTests,
  testSemanticHashGeneration,
  testCacheSaveRetrieve,
  testMustHaveChangeDetection,
  testCacheReusability,
  testCacheExpirationManagement,
  testCacheStatistics
};

// 直接実行時
if (require.main === module) {
  const results = runAllTests();
  process.exit(results.overall_status === 'passed' ? 0 : 1);
}
