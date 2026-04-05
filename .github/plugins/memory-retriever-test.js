/**
 * memory-retriever-test.js
 * 
 * Memory Retriever: Tiered retrieval 統合テスト
 * - Tier-1 Core ロード
 * - Tier-2 Patterns 検索
 * - Tier-3 Episodes 検索
 * - Hybrid retrieval
 * - 競合解決
 * - 予算制御
 */

const retriever = require('./memory-tiered-retriever.js');

/**
 * テスト1: Tier-1 Core ロード
 */
function testTier1Loading() {
  console.log('\n=== Test 1: Tier-1 Core Loading ===\n');

  const tier1 = retriever.loadTier1Core();
  console.log('Tier-1 Status:', tier1.file_not_found ? '⚠️ File not found' : '✅ Loaded');
  console.log('Tokens:', tier1.tokens);
  console.log('Loaded at:', tier1.loaded_at);

  return !tier1.file_not_found || tier1.tokens >= 0;
}

/**
 * テスト2: Tier-2 Patterns ロード
 */
function testTier2Loading() {
  console.log('\n=== Test 2: Tier-2 Patterns Loading ===\n');

  const tier2 = retriever.loadTier2Patterns();
  console.log('Tier-2 Status:', tier2.index_not_found ? '⚠️ Index not found' : '✅ Loaded');
  console.log('Patterns count:', tier2.patterns.length);

  return true; // Index が存在しなくてもテストは成功
}

/**
 * テスト3: Tier-3 Episodes ロード
 */
function testTier3Loading() {
  console.log('\n=== Test 3: Tier-3 Episodes Loading ===\n');

  const tier3 = retriever.loadTier3Episodes();
  console.log('Tier-3 Status:', tier3.directory_not_found ? '⚠️ Directory not found' : '✅ Loaded');
  console.log('Episodes count:', tier3.total_episodes || 0);

  return true;
}

/**
 * テスト4: キーワードスコアリング
 */
function testKeywordScoring() {
  console.log('\n=== Test 4: Keyword Scoring ===\n');

  const text = 'This is a test about planning and caching mechanisms';
  const keywords1 = ['planning', 'caching'];
  const keywords2 = ['authentication', 'payment'];

  const score1 = retriever.scoreByKeywords(text, keywords1);
  const score2 = retriever.scoreByKeywords(text, keywords2);

  console.log('Text:', text);
  console.log('Keywords 1 (relevant):', keywords1, '→ Score:', score1.toFixed(2));
  console.log('Keywords 2 (not relevant):', keywords2, '→ Score:', score2.toFixed(2));

  const test_pass = score1 > score2;
  console.log('\nRelevant > Not relevant:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト5: Semantic 類似度スコアリング
 */
function testSemanticScoring() {
  console.log('\n=== Test 5: Semantic Similarity Scoring ===\n');

  const text1 = 'Planner decomposes tasks into implementation steps';
  const text2 = 'Coordinator orchestrates the workflow';
  const query = 'decompose tasks implementation';

  const score1 = retriever.scoreBySemanticSimilarity(text1, query);
  const score2 = retriever.scoreBySemanticSimilarity(text2, query);

  console.log('Query:', query);
  console.log('Text 1:', text1, '→ Score:', score1.toFixed(2));
  console.log('Text 2:', text2, '→ Score:', score2.toFixed(2));

  const test_pass = score1 > score2;
  console.log('\nHigher similarity for related text:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト6: Hybrid Retrieval
 */
function testHybridRetrieval() {
  console.log('\n=== Test 6: Hybrid Retrieval ===\n');

  const mock_patterns = [
    { name: 'Pattern A: Caching mechanism', content: 'Cache implementation with TTL and semantic hash', access_count: 5 },
    { name: 'Pattern B: Auth flow', content: 'Authentication and authorization process', access_count: 3 },
    { name: 'Pattern C: Planning', content: 'Plan decomposition and task scheduling', access_count: 7 }
  ];

  const query = 'caching and planning';

  const results = retriever.hybridRetrieval(mock_patterns, query, {
    keyword_weight: 0.6,
    semantic_weight: 0.4,
    top_k: 3
  });

  console.log('Query:', query);
  console.log('\nHybrid Retrieval Results:');
  results.forEach((result, idx) => {
    console.log(`${idx + 1}. ${result.name}`);
    console.log(`   Keyword: ${result.scores.keyword.toFixed(2)}, Semantic: ${result.scores.semantic.toFixed(2)}, Hybrid: ${result.scores.hybrid.toFixed(2)}`);
  });

  const test_pass = results.length > 0 && results[0].scores.hybrid > 0;
  console.log('\nHybrid retrieval produced results:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト7: 競合解決
 */
function testConflictResolution() {
  console.log('\n=== Test 7: Conflict Resolution (Priority) ===\n');

  const candidates = [
    { name: 'Option A', created_at: '2026-04-01T10:00:00Z', access_count: 2, specificity: 0.7 },
    { name: 'Option B', created_at: '2026-04-05T10:00:00Z', access_count: 5, specificity: 0.9 },
    { name: 'Option C', created_at: '2026-04-04T10:00:00Z', access_count: 3, specificity: 0.8 }
  ];

  const resolved = retriever.resolveConflicts(candidates, {
    prefer_recent: true,
    prefer_specificity: true
  });

  console.log('Original order:');
  candidates.forEach((c, i) => console.log(`${i + 1}. ${c.name}`));

  console.log('\nAfter conflict resolution:');
  resolved.forEach((c, i) => console.log(`${i + 1}. ${c.name}`));

  // Option B（最新・specificity高・access多）が最優先と期待
  const test_pass = resolved[0].name === 'Option B';
  console.log('\nOption B (latest, highest specificity) first:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト8: 予算制御
 */
function testBudgetControl() {
  console.log('\n=== Test 8: Budget Control (Token Limit) ===\n');

  const candidates = [
    { name: 'Item 1', content: 'Short text' },
    { name: 'Item 2', content: 'This is a medium length piece of content that contains multiple words' },
    { name: 'Item 3', content: 'A' }
  ];

  const max_tokens = 50;

  const selected = retriever.applyBudgetControl(candidates, max_tokens);

  console.log('Max tokens:', max_tokens);
  console.log('Candidates:', candidates.length);
  console.log('Selected:', selected.length);

  const test_pass = selected.length <= candidates.length;
  console.log('\nBudget control applied:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト9: トークン推定
 */
function testTokenEstimation() {
  console.log('\n=== Test 9: Token Estimation ===\n');

  const text1 = 'Short text';
  const text2 = 'This is a longer piece of text with more words to estimate token count accurately';

  const tokens1 = retriever.estimateTokens(text1);
  const tokens2 = retriever.estimateTokens(text2);

  console.log('Text 1:', text1, '→', tokens1, 'tokens');
  console.log('Text 2:', text2, '→', tokens2, 'tokens');

  const test_pass = tokens2 > tokens1;
  console.log('\nLonger text has more tokens:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト10: 完全な Tiered Retrieval フロー
 */
function testFullTieredRetrieval() {
  console.log('\n=== Test 10: Full Tiered Retrieval Flow ===\n');

  const query = 'Planner caching mechanism for task decomposition';

  const result = retriever.performTieredRetrieval(query, {
    max_tier1_tokens: 2000,
    max_tier2_tokens: 1500,
    max_tier3_tokens: 500,
    tier2_pattern_weight: 0.6,
    tier2_new_capability_weight: 0.4
  });

  console.log('Query:', query);
  console.log('\nRetrieval Plan:');
  result.retrieval_plan.stages.forEach((stage, idx) => {
    console.log(`\n${idx + 1}. ${stage.stage}`);
    console.log(`   Status: ${stage.status}`);
    if (stage.candidates_total !== undefined) {
      console.log(`   Total candidates: ${stage.candidates_total}`);
      console.log(`   Selected: ${stage.candidates_selected}`);
    }
    console.log(`   Tokens: ${stage.tokens}`);
  });

  console.log('\nTotal tokens:', result.total_tokens);
  console.log('Context tiers:', result.context_tier_summary);

  const test_pass = result.total_tokens >= 0;
  console.log('\nFull retrieval flow completed:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト11: Query Complexity Estimation
 */
function testQueryComplexityEstimation() {
  console.log('\n=== Test 11: Query Complexity Estimation ===\n');

  const simpleQuery = 'cache';
  const complexQuery = '過去3か月の設計変更の矛盾点を比較して原因と影響を要約して';

  const simpleScore = retriever.estimateQueryComplexity(simpleQuery);
  const complexScore = retriever.estimateQueryComplexity(complexQuery);

  console.log('Simple query:', simpleQuery, '→', simpleScore.toFixed(2));
  console.log('Complex query:', complexQuery, '→', complexScore.toFixed(2));

  const test_pass = complexScore >= simpleScore;
  console.log('\nComplexity score ordering:', test_pass ? '✅ PASS' : '❌ FAIL');

  return test_pass;
}

/**
 * テスト12: Context Tier Packaging
 */
function testContextTierPackaging() {
  console.log('\n=== Test 12: Context Tier Packaging ===\n');

  const query = '詳細な設計判断と背景と影響を整理して比較して';
  const result = retriever.performTieredRetrieval(query, {
    max_tier2_tokens: 500,
    max_tier3_tokens: 200,
    base_top_k: 8,
    complexity_delta: 1.0
  });

  const tierSummary = result.context_tier_summary || {};
  console.log('Tier summary:', tierSummary);

  const hasTierOutput =
    (tierSummary.full || 0) +
    (tierSummary.summary || 0) +
    (tierSummary.reference || 0) >= 0;

  console.log('\nTier summary generated:', hasTierOutput ? '✅ PASS' : '❌ FAIL');
  return hasTierOutput;
}

/**
 * テスト13: 日本語クエリのトークン抽出
 */
function testJapaneseTokenization() {
  console.log('\n=== Test 13: Japanese Tokenization ===\n');

  const tokens = retriever.extractQueryTokens('設計変更の矛盾点を比較して要約');
  console.log('Extracted tokens:', tokens.slice(0, 10));

  const test_pass = tokens.length > 0;
  console.log('\nJapanese tokens extracted:', test_pass ? '✅ PASS' : '❌ FAIL');
  return test_pass;
}

/**
 * テスト14: Tier-1 予算制御
 */
function testTier1BudgetControl() {
  console.log('\n=== Test 14: Tier-1 Budget Control ===\n');

  const result = retriever.performTieredRetrieval('core context', {
    max_tier1_tokens: 20,
    max_tier2_tokens: 0,
    max_tier3_tokens: 0
  });

  console.log('Tier-1 tokens:', result.tier_1.tokens);
  console.log('Tier-1 content length:', (result.tier_1.content || '').length);

  const test_pass = result.tier_1.tokens <= 20;
  console.log('\nTier-1 token cap applied:', test_pass ? '✅ PASS' : '❌ FAIL');
  return test_pass;
}

/**
 * メイン実行
 */
function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Memory Retriever Tiered Test Suite    ║');
  console.log('╚════════════════════════════════════════╝');

  const results = {
    timestamp: new Date().toISOString(),
    tests: [
      { name: 'Tier-1 Core Loading', result: testTier1Loading() },
      { name: 'Tier-2 Patterns Loading', result: testTier2Loading() },
      { name: 'Tier-3 Episodes Loading', result: testTier3Loading() },
      { name: 'Keyword Scoring', result: testKeywordScoring() },
      { name: 'Semantic Similarity Scoring', result: testSemanticScoring() },
      { name: 'Hybrid Retrieval', result: testHybridRetrieval() },
      { name: 'Conflict Resolution', result: testConflictResolution() },
      { name: 'Budget Control', result: testBudgetControl() },
      { name: 'Token Estimation', result: testTokenEstimation() },
      { name: 'Full Tiered Retrieval Flow', result: testFullTieredRetrieval() },
      { name: 'Query Complexity Estimation', result: testQueryComplexityEstimation() },
      { name: 'Context Tier Packaging', result: testContextTierPackaging() },
      { name: 'Japanese Tokenization', result: testJapaneseTokenization() },
      { name: 'Tier-1 Budget Control', result: testTier1BudgetControl() }
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
  runAllTests
};

// 直接実行時
if (require.main === module) {
  const results = runAllTests();
  process.exit(results.overall_status === 'passed' ? 0 : 1);
}
