/**
 * phase-transition-guard.js
 * 
 * Hook: phase-transition-guard
 * Trigger: PreToolUse（工程遷移直前）
 * 
 * 工程順序の厳格制御（FR-13d）
 * - 逆戻り検出と自動巻き戻し
 * - スキップ検出と禁止
 * - 成果物完全性チェック
 */

const fs = require('fs');
const path = require('path');

const CURRENT_TASK_FILE = path.join(__dirname, '..', '..', 'state', 'current_task.json');

/**
 * 有効な工程遷移マップ
 */
const VALID_TRANSITIONS = {
  'initialization': ['requirement_analysis'],
  'no_active_task': ['requirement_analysis'],
  'requirement_analysis': ['requirement_definition'],
  'requirement_definition': ['specification'],
  'specification': ['delivery_planning'],
  'delivery_planning': ['design'],
  'design': ['implementation'],
  'implementation': ['fast_review'],
  'fast_review': ['deep_review'],
  'deep_review': ['uat'],
  'uat': ['complete'],
  'complete': []
};

const PHASE_ORDER = [
  'initialization',
  'requirement_analysis',
  'requirement_definition',
  'specification',
  'delivery_planning',
  'design',
  'implementation',
  'fast_review',
  'deep_review',
  'uat',
  'complete'
];

/**
 * 現在のタスク状態を読み込み
 */
function loadCurrentTask() {
  if (!fs.existsSync(CURRENT_TASK_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CURRENT_TASK_FILE, 'utf8'));
}

function getCurrentPhase(current_task) {
  return (
    current_task?.current_workflow?.phase ||
    current_task?.system_status?.current_phase ||
    current_task?.system_status?.phase ||
    null
  );
}

/**
 * 工程遷移が有効か確認
 * @param {string} current_phase - 現在の工程
 * @param {string} next_phase - 次の工程
 * @returns {Object} { valid: boolean, reason: string }
 */
function validateTransition(current_phase, next_phase) {
  if (current_phase === null && next_phase === 'requirement_analysis') {
    return {
      valid: true,
      reason: 'Initial transition to requirement_analysis is valid'
    };
  }

  // 有効な遷移か確認
  if (!VALID_TRANSITIONS[current_phase]) {
    return {
      valid: false,
      reason: `INVALID_CURRENT_PHASE: "${current_phase}" is not a valid phase`
    };
  }

  if (!VALID_TRANSITIONS[current_phase].includes(next_phase)) {
    return {
      valid: false,
      reason: `INVALID_TRANSITION: "${current_phase}" -> "${next_phase}" is not allowed`
    };
  }

  return {
    valid: true,
    reason: 'Transition is valid'
  };
}

/**
 * 逆戻り（backtrack）検出
 * @param {string} current_phase - 現在の工程
 * @param {string} next_phase - 次の工程
 * @returns {Object} { is_backtrack: boolean, jump_levels: number }
 */
function detectBacktrack(current_phase, next_phase) {
  if (current_phase === null) {
    return {
      is_backtrack: false,
      jump_levels: 0,
      backtrack_target: next_phase
    };
  }

  const current_idx = PHASE_ORDER.indexOf(current_phase);
  const next_idx = PHASE_ORDER.indexOf(next_phase);

  const is_backtrack = next_idx < current_idx;
  const jump_levels = current_idx - next_idx;

  return {
    is_backtrack: is_backtrack,
    jump_levels: jump_levels,
    backtrack_target: next_phase
  };
}

/**
 * フェーズスキップ検出
 * @param {string} current_phase - 現在の工程
 * @param {string} next_phase - 次の工程
 * @returns {Object} { is_skip: boolean, skipped_phases: [] }
 */
function detectSkip(current_phase, next_phase) {
  if (current_phase === null) {
    return {
      is_skip: false,
      skipped_phases: []
    };
  }

  const current_idx = PHASE_ORDER.indexOf(current_phase);
  const next_idx = PHASE_ORDER.indexOf(next_phase);

  // 次の工程が current の 2 以上先か
  if (next_idx - current_idx >= 2) {
    const skipped_phases = PHASE_ORDER.slice(current_idx + 1, next_idx);
    return {
      is_skip: true,
      skipped_phases: skipped_phases
    };
  }

  return {
    is_skip: false,
    skipped_phases: []
  };
}

/**
 * 出戻り（backtrack）時の自動アクション
 * @param {Object} current_task - 現在のタスク
 * @param {string} rollback_target - 巻き戻し先工程
 * @returns {Object} ロールバック結果
 */
function performRollback(current_task, rollback_target) {
  const rollback_result = {
    timestamp: new Date().toISOString(),
    previous_phase: getCurrentPhase(current_task),
    rollback_target: rollback_target,
    actions_performed: []
  };

  try {
    // アクション 1: rollback_target を確定
    current_task.current_workflow = current_task.current_workflow || {};
    current_task.current_workflow.rollback_target_phase = rollback_target;
    rollback_result.actions_performed.push('rollback_target_confirmed');

    // アクション 2: rollback_count をインクリメント
    current_task.execution_tracking = current_task.execution_tracking || {};
    if (!current_task.execution_tracking.rollback_count) {
      current_task.execution_tracking.rollback_count = 0;
    }
    current_task.execution_tracking.rollback_count += 1;
    rollback_result.actions_performed.push('rollback_count_incremented');
    rollback_result.rollback_count = current_task.execution_tracking.rollback_count;

    // アクション 3: 後続工程の成果物をイニシャライズ（marked_for_deletion）
    const current_idx = PHASE_ORDER.indexOf(rollback_target);
    const artifacts_to_invalidate = PHASE_ORDER.slice(current_idx + 1);
    current_task.artifact_tracking = current_task.artifact_tracking || {};
    current_task.artifact_tracking.marked_for_deletion = artifacts_to_invalidate;
    rollback_result.actions_performed.push('artifacts_marked_for_deletion');
    rollback_result.invalidated_phases = artifacts_to_invalidate;

    // アクション 4: phase_order を巻き戻す
    current_task.system_status = current_task.system_status || {};
    current_task.system_status.current_phase = rollback_target;
    current_task.current_workflow.phase = rollback_target;
    rollback_result.actions_performed.push('phase_rolled_back');
    rollback_result.new_phase = rollback_target;

    // アクション 5: JSONL ログに PHASE_ROLLBACK イベント記録予定
    rollback_result.actions_performed.push('audit_event_scheduled');

    // 状態ファイル更新
    fs.writeFileSync(CURRENT_TASK_FILE, JSON.stringify(current_task, null, 2), 'utf8');
    rollback_result.state_file_updated = true;

  } catch (error) {
    rollback_result.error = error.message;
    rollback_result.state_file_updated = false;
  }

  return rollback_result;
}

/**
 * PreToolUse トリガー処理（工程遷移ガード）
 * @param {Object} params - { next_phase, task_id }
 * @returns {Object} { approval: boolean, denial_code, action, details }
 */
function checkPhaseTransitionGuard(params) {
  const { next_phase, task_id } = params;

  const current_task = loadCurrentTask();
  if (!current_task) {
    return {
      approval: false,
      denial_code: 'NO_ACTIVE_TASK',
      issues: ['No active task found'],
      checked_at: new Date().toISOString()
    };
  }

  const current_phase = getCurrentPhase(current_task);

  // 逆戻りは INVALID_TRANSITION より先に検出して自動巻き戻しする。
  const backtrack_check = detectBacktrack(current_phase, next_phase);
  if (backtrack_check.is_backtrack) {
    const rollback_result = performRollback(current_task, next_phase);
    return {
      approval: false,
      denial_code: 'PHASE_ROLLBACK_AUTO_ACTIVATED',
      action: 'auto_rollback_executed',
      rollback_details: rollback_result,
      issues: [`Backtrack detected. Auto-rollback to "${next_phase}" performed.`],
      checked_at: new Date().toISOString()
    };
  }

  // 工程遷移の妥当性を確認
  const transition_check = validateTransition(current_phase, next_phase);
  if (!transition_check.valid) {
    return {
      approval: false,
      denial_code: 'PHASE_TRANSITION_INVALID',
      issues: [transition_check.reason],
      checked_at: new Date().toISOString()
    };
  }

  // スキップ検出
  const skip_check = detectSkip(current_phase, next_phase);
  if (skip_check.is_skip) {
    return {
      approval: false,
      denial_code: 'PHASE_SKIP_DETECTED',
      issues: [`Cannot skip phases: ${skip_check.skipped_phases.join(' -> ')}`],
      checked_at: new Date().toISOString()
    };
  }

  // すべてのチェック合格
  return {
    approval: true,
    denial_code: null,
    transition_valid: true,
    current_phase: current_phase,
    next_phase: next_phase,
    checked_at: new Date().toISOString()
  };
}

// エクスポート
module.exports = {
  checkPhaseTransitionGuard,
  validateTransition,
  detectBacktrack,
  detectSkip,
  performRollback,
  VALID_TRANSITIONS,
  PHASE_ORDER
};

// 直接実行時（テスト）
if (require.main === module) {
  // テストケース
  console.log('\n=== Phase Transition Guard Test ===\n');

  // テスト 1: 有効な遷移
  console.log('Test 1: Valid Transition (design -> implementation)');
  const test1 = checkPhaseTransitionGuard({
    next_phase: 'implementation',
    task_id: 'test-001'
  });
  console.log(JSON.stringify(test1, null, 2));

  // テスト 2: スキップ検出
  console.log('\nTest 2: Skip Detection (design -> uat)');
  const test2 = checkPhaseTransitionGuard({
    next_phase: 'uat',
    task_id: 'test-001'
  });
  console.log(JSON.stringify(test2, null, 2));
}
