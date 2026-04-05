/**
 * cost-guard.js
 * 
 * Hook: cost-guard
 * Trigger: SessionStart
 * 
 * 予算管理・4 段階降格ポリシー実装
 * - budget_state.json から予算情報を読み込み
 * - predicted_cost を計算し、警告・降格ルール適用
 */

const fs = require('fs');
const path = require('path');

const BUDGET_STATE_FILE = path.join(__dirname, '..', '..', 'state', 'budget_state.json');
const CURRENT_TASK_FILE = path.join(__dirname, '..', '..', 'state', 'current_task.json');

/**
 * 予算状態を読み込み
 */
function loadBudgetState() {
  if (!fs.existsSync(BUDGET_STATE_FILE)) {
    throw new Error(`Budget state file not found: ${BUDGET_STATE_FILE}`);
  }
  return JSON.parse(fs.readFileSync(BUDGET_STATE_FILE, 'utf8'));
}

/**
 * 現在のタスク状態を読み込み
 */
function loadCurrentTask() {
  if (fs.existsSync(CURRENT_TASK_FILE)) {
    return JSON.parse(fs.readFileSync(CURRENT_TASK_FILE, 'utf8'));
  }
  return null;
}

/**
 * 予算状態のスキーマ差分を吸収して正規化
 * @param {Object} budget_state
 * @returns {Object}
 */
function normalizeBudgetState(budget_state) {
  const phaseAllocation =
    budget_state?.budget_allocation?.phase_1_estimated_requests ??
    budget_state?.budget_allocation?.phase_1_estimated_total_requests ??
    0;

  const trackedTotal = budget_state?.consumption_tracking?.total_consumed_requests;
  let consumed = typeof trackedTotal === 'number' ? trackedTotal : 0;

  if (typeof trackedTotal !== 'number' && budget_state?.consumption_tracking) {
    const weekly = Object.values(budget_state.consumption_tracking);
    consumed = weekly.reduce((sum, item) => {
      if (item && typeof item.actual_requests === 'number') {
        return sum + item.actual_requests;
      }
      return sum;
    }, 0);
  }

  const modelMap = {};
  if (budget_state?.model_cost_multiplier && typeof budget_state.model_cost_multiplier === 'object') {
    Object.assign(modelMap, budget_state.model_cost_multiplier);
  }
  if (Array.isArray(budget_state?.model_cost_table?.models)) {
    for (const model of budget_state.model_cost_table.models) {
      if (model?.name) {
        modelMap[model.name] = typeof model.multiplier === 'number' ? model.multiplier : 1;
      }
    }
  }

  const warningThreshold =
    budget_state?.alert_thresholds?.budget_exhaustion_80_percent ??
    budget_state?.alert_thresholds?.budget_warning_percentage ??
    0.8;

  const criticalThreshold =
    budget_state?.alert_thresholds?.budget_exhaustion_95_percent ??
    budget_state?.alert_thresholds?.budget_critical_percentage ??
    0.95;

  const models = Array.isArray(budget_state?.model_cost_table?.models)
    ? budget_state.model_cost_table.models
    : [];

  return {
    allocated: phaseAllocation,
    consumed,
    model_table: models,
    model_cost_multiplier: modelMap,
    alert_thresholds: {
      budget_exhaustion_80_percent: warningThreshold,
      budget_exhaustion_95_percent: criticalThreshold
    }
  };
}

function inferCapabilityRank(modelName) {
  const name = String(modelName || '').toLowerCase();
  if (name.includes('gpt-5.3-codex')) return 100;
  if (name.includes('gpt-5.1-codex')) return 95;
  if (name.includes('claude sonnet 4.6')) return 92;
  if (name.includes('gpt-4.1')) return 85;
  if (name.includes('gpt-5 mini')) return 80;
  return 50;
}

function selectHighestCapabilitySameMultiplier(selectedModel, budget_state) {
  if (!selectedModel || !Array.isArray(budget_state?.model_table)) {
    return selectedModel;
  }

  const selectedMultiplier = budget_state.model_cost_multiplier[selectedModel];
  if (selectedMultiplier === undefined) return selectedModel;

  const sameTier = budget_state.model_table.filter(
    (m) => typeof m?.multiplier === 'number' && m.multiplier === selectedMultiplier
  );
  if (sameTier.length === 0) return selectedModel;

  const best = sameTier.reduce((prev, current) => {
    const prevRank = typeof prev.capability_rank === 'number' ? prev.capability_rank : inferCapabilityRank(prev.name);
    const currRank = typeof current.capability_rank === 'number' ? current.capability_rank : inferCapabilityRank(current.name);
    return currRank > prevRank ? current : prev;
  });

  return best?.name || selectedModel;
}

/**
 * predicted_cost を計算
 * @param {number} planned_user_prompts - 計画されたユーザープロンプト数
 * @param {string} selected_model - 選択モデル
 * @param {Object} budget_state - 予算状態
 * @returns {number} 予測コスト
 */
function calculatePredictedCost(planned_user_prompts, selected_model, budget_state) {
  const multiplier = (budget_state.model_cost_multiplier && budget_state.model_cost_multiplier[selected_model] !== undefined)
    ? budget_state.model_cost_multiplier[selected_model]
    : 1;
  return planned_user_prompts * multiplier;
}

/**
 * 警告閾値の判定
 * @param {number} predicted_cost - 予測コスト
 * @param {number} remaining_budget - 残予算
 * @returns {Object} 警告情報
 */
function checkAlertThreshold(predicted_cost, remaining_budget, budget_state) {
  const alert_threshold = budget_state.alert_thresholds.budget_exhaustion_80_percent;
  const critical_threshold = budget_state.alert_thresholds.budget_exhaustion_95_percent;

  const result = {
    predicted_cost: predicted_cost,
    remaining_budget: remaining_budget,
    will_exceed_budget: predicted_cost > remaining_budget,
    alert_triggered: false,
    critical_alert_triggered: false,
    cost_guard_applied: false,
    recommended_action: null
  };

  // 80% 警告
  if (predicted_cost >= alert_threshold * remaining_budget) {
    result.alert_triggered = true;
    result.cost_guard_applied = true;
    result.recommended_action = 'warn_and_apply_cost_guard';
  }

  // 95% 重大警告
  if (predicted_cost >= critical_threshold * remaining_budget) {
    result.critical_alert_triggered = true;
    result.cost_guard_applied = true;
    result.recommended_action = 'critical_warn_and_enforce_cost_guard';
  }

  return result;
}

/**
 * 4 段階降格ポリシーを適用
 * @param {object} alert_info - 警告情報
 * @param {Object} current_task - 現在のタスク
 * @returns {Object} 適用結果
 */
function applyDegradationPolicy(alert_info, current_task) {
  const degradation_steps = [
    'deep_review_disabled',
    'parallel_execution_disabled',
    'low_cost_model_enforced',
    'minimal_result_response_only'
  ];

  const appliedSteps = [];

  if (!alert_info.cost_guard_applied) {
    return {
      applied: false,
      steps: [],
      message: 'Cost guard not triggered'
    };
  }

  // 80% 警告 → Step 1: Deep Review 無効化
  if (alert_info.alert_triggered && !alert_info.critical_alert_triggered) {
    appliedSteps.push(degradation_steps[0]);
  }

  // 95% 重大警告 → Step 2, 3, 4
  if (alert_info.critical_alert_triggered) {
    appliedSteps.push(...degradation_steps.slice(0, 4));
  }

  // 状態を更新
  if (current_task) {
    current_task.cost_tracking.cost_guard_applied = true;
    current_task.cost_tracking.degradation_steps = appliedSteps;
  }

  return {
    applied: true,
    steps: appliedSteps,
    message: `${appliedSteps.length} degradation steps applied`
  };
}

/**
 * ユーザー警告メッセージ生成
 * @param {Object} alert_info - 警告情報
 * @returns {string} 警告メッセージ
 */
function generateWarningMessage(alert_info) {
  if (alert_info.critical_alert_triggered) {
    return `⚠️  【重大警告】予算が危機的状況です。残予算 ${alert_info.remaining_budget} 要求に対し、予測コスト ${alert_info.predicted_cost} です。段階的にサービスを制限します。`;
  }

  if (alert_info.alert_triggered) {
    return `⚠️  【警告】予算が 80% 消費に近づいています。残予算 ${alert_info.remaining_budget} 要求に対し、予測コスト ${alert_info.predicted_cost} です。Deep Review を一時的に無効化します。`;
  }

  return null;
}

/**
 * SessionStart トリガー処理
 */
function onSessionStart() {
  try {
    const raw_budget_state = loadBudgetState();
    const budget_state = normalizeBudgetState(raw_budget_state);
    const current_task = loadCurrentTask();

    // 残予算計算
    const consumed = budget_state.consumed;
    const allocated = budget_state.allocated;
    const remaining_budget = allocated - consumed;

    // 計測モデルの予測コスト計算
    let predicted_cost = 0;
    const selected_model_raw = current_task?.cost_tracking?.selected_model || 'GPT-5 mini';
    const selected_model = selectHighestCapabilitySameMultiplier(selected_model_raw, budget_state);
    const planned_prompts = current_task?.cost_tracking?.planned_user_prompts || 0;

    if (current_task?.cost_tracking) {
      current_task.cost_tracking.selected_model = selected_model;
      current_task.cost_tracking.selected_model_selection_reason =
        selected_model === selected_model_raw
          ? 'unchanged'
          : `same multiplier as ${selected_model_raw}; upgraded to higher capability model`;
    }

    if (planned_prompts > 0) {
      predicted_cost = calculatePredictedCost(planned_prompts, selected_model, budget_state);
    }

    // 警告判定
    const alert_info = checkAlertThreshold(predicted_cost, remaining_budget, budget_state);

    // 降格ポリシー適用
    const degradation_result = applyDegradationPolicy(alert_info, current_task);

    // ユーザー警告メッセージ
    const warning_message = generateWarningMessage(alert_info);

    // 結果出力
    const result = {
      session_timestamp: new Date().toISOString(),
      budget_status: {
        allocated: allocated,
        consumed: consumed,
        remaining: remaining_budget,
        percent_consumed: allocated > 0 ? ((consumed / allocated) * 100).toFixed(1) + '%' : '0.0%'
      },
      cost_analysis: alert_info,
      degradation_policy: degradation_result,
      warning_message: warning_message,
      action_taken: alert_info.cost_guard_applied ? 'cost_guard_activated' : 'normal_operation'
    };

    // 状態ファイルを更新（cost_guard_applied フラグ）
    if (current_task && alert_info.cost_guard_applied) {
      fs.writeFileSync(CURRENT_TASK_FILE, JSON.stringify(current_task, null, 2), 'utf8');
    }

    console.log('Cost Guard SessionStart Check:', JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    console.error('Cost Guard initialization error:', error.message);
    return {
      session_timestamp: new Date().toISOString(),
      error: error.message,
      action_taken: 'error_cannot_initialize_cost_guard'
    };
  }
}

// エクスポート
module.exports = {
  loadBudgetState,
  loadCurrentTask,
  normalizeBudgetState,
  calculatePredictedCost,
  checkAlertThreshold,
  applyDegradationPolicy,
  generateWarningMessage,
  onSessionStart
};

// 直接実行時
if (require.main === module) {
  onSessionStart();
}
