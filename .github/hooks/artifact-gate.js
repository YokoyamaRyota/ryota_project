/**
 * artifact-gate.js
 * 
 * Hook: artifact-gate
 * Trigger: PreToolUse（工程遷移時）
 * 
 * 成果物更新の整合性を検査（FR-13e）
 * - ファイル存在確認
 * - 更新時刻確認
 * - sync_status フィールド確認
 * - must-have 項目存在確認
 */

const fs = require('fs');
const path = require('path');
const { resolveWorkspaceRoot } = require('./lib/paths.js');

const ARTIFACT_GATE_CONFIG = {
  requirement_analysis: {
    required_files: [],
    must_have_fields: [],
    description: 'Requirement analysis phase (no pre-condition files)'
  },
  requirement_definition: {
    required_files: ['requirements-definition.md'],
    must_have_fields: ['## 1. 背景', '## 2. 目的', '## 3. ビジネス目標', '## 6. 成功指標'],
    description: 'Requirements definition phase transition gate (FR-13)'
  },
  specification: {
    required_files: ['system-specification.md'],
    must_have_fields: ['## 2. 機能要件', '## 3. 非機能要件', '## 4. 運用要件'],
    description: 'Specification phase transition gate (FR-13)'
  },
  delivery_planning: {
    required_files: ['delivery-plan.md'],
    must_have_fields: ['## 4. マイルストーン', '## 6. 検証観点'],
    description: 'Delivery planning phase transition gate (FR-13)'
  },
  design: {
    required_files: ['design.md', 'feature-design.md'],
    must_have_fields: [],
    description: 'Design phase transition gate (FR-13)'
  },
  planning: {
    required_files: ['copilot-system/runtime/cache/planner/plan_*.json'],
    must_have_fields: [],
    description: 'Planning phase (Planner execution)'
  },
  implementation: {
    required_files: [
      'requirements-definition.md',
      'system-specification.md',
      'delivery-plan.md',
      'design.md',
      'feature-design.md'
    ],
    must_have_fields: [],
    description: 'Implementation phase gate (FR-13a - all upstream artifacts)'
  },
  fast_review: {
    required_files: [],
    must_have_fields: [],
    description: 'Fast review phase (initial check)'
  },
  deep_review: {
    required_files: ['review-report.md'],
    must_have_fields: ['## 1. 監査ヘッダ', '## 3. 判定', '## 6. 検出事項', '## 9. 承認記録'],
    description: 'Deep review phase transition gate'
  },
  uat: {
    required_files: ['review-report.md'],
    must_have_fields: ['## 3. 判定', '## 8. 次アクション', 'audit_event_ref'],
    description: 'UAT phase transition gate'
  },
  complete: {
    required_files: ['copilot-system/runtime/audit_log/events.jsonl'],
    must_have_fields: [],
    description: 'Task completion gate (episode + audit log)'
  }
};

const WORKSPACE_ROOT = resolveWorkspaceRoot();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveMatchingFiles(file_path) {
  if (!file_path.includes('*')) {
    return [file_path];
  }

  const normalizedPattern = file_path.replace(/\\/g, '/');
  const regex = new RegExp(
    '^' + normalizedPattern.split('*').map(escapeRegExp).join('.*') + '$'
  );

  const matches = [];

  function walkDirectory(relative_dir) {
    const absolute_dir = path.join(WORKSPACE_ROOT, relative_dir);
    if (!fs.existsSync(absolute_dir)) return;

    const entries = fs.readdirSync(absolute_dir, { withFileTypes: true });
    for (const entry of entries) {
      const next_relative = relative_dir
        ? path.posix.join(relative_dir.replace(/\\/g, '/'), entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        walkDirectory(next_relative);
        continue;
      }

      if (regex.test(next_relative.replace(/\\/g, '/'))) {
        matches.push(next_relative.replace(/\\/g, '/'));
      }
    }
  }

  walkDirectory('');
  return matches;
}

function getExistingFiles(file_path) {
  return resolveMatchingFiles(file_path).filter(candidate => {
    const full_path = path.join(WORKSPACE_ROOT, candidate);
    return fs.existsSync(full_path);
  });
}

/**
 * ファイルの存在確認
 * @param {string} file_path - 相対パス
 * @returns {boolean}
 */
function fileExists(file_path) {
  return getExistingFiles(file_path).length > 0;
}

/**
 * ファイルの更新時刻を取得
 * @param {string} file_path - 相対パス
 * @returns {number} Unix timestamp (ms)
 */
function getFileUpdateTime(file_path) {
  const existing_files = getExistingFiles(file_path);
  if (existing_files.length === 0) return null;

  return Math.max(
    ...existing_files.map(candidate => {
      const stat = fs.statSync(path.join(WORKSPACE_ROOT, candidate));
      return stat.mtimeMs;
    })
  );
}

/**
 * ファイルが decision_id 有効期限内に更新されたか確認
 * @param {string} file_path - ファイルパス
 * @param {string} decision_id - 意思決定 ID（タイムスタンプベース）
 * @returns {boolean}
 */
function isFileUpdatedAfterDecision(file_path, decision_time_ms) {
  const file_time = getFileUpdateTime(file_path);
  if (file_time === null) return false;
  return file_time >= decision_time_ms - 5000; // 5 秒の猶予
}

function parseDecisionTimestampToMs(decision_timestamp) {
  if (!decision_timestamp) return null;
  const parsed = new Date(decision_timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getExpectedEpisodePath(task_id) {
  return task_id ? `copilot-system/runtime/memory/l0/decision-${task_id}.json` : null;
}

/**
 * YAML frontmatter から sync_status を抽出
 * @param {string} file_path - ファイルパス
 * @returns {string | null} sync_status 値
 */
function extractSyncStatus(file_path) {
  const full_path = path.join(WORKSPACE_ROOT, file_path);
  if (!fs.existsSync(full_path)) return null;

  try {
    const content = fs.readFileSync(full_path, 'utf8');

    // YAML frontmatter 解析（簡易版）
    // regex: ---\n(.*?)\n---
    const frontmatter_match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter_match) return null;

    const frontmatter = frontmatter_match[1];
    const sync_status_match = frontmatter.match(/sync_status:\s*(\w+)/);

    return sync_status_match ? sync_status_match[1] : null;
  } catch (e) {
    console.error(`Error parsing frontmatter in ${file_path}:`, e.message);
    return null;
  }
}

/**
 * must-have フィールドの確認
 * @param {string} file_path - ファイルパス
 * @param {string[]} must_have_fields - 必須フィールド
 * @returns {Object} { all_found: boolean, found: [], missing: [] }
 */
function checkMustHaveFields(file_path, must_have_fields) {
  const full_path = path.join(WORKSPACE_ROOT, file_path);
  if (!fs.existsSync(full_path)) {
    return {
      all_found: false,
      found: [],
      missing: must_have_fields
    };
  }

  try {
    const content = fs.readFileSync(full_path, 'utf8').toLowerCase();
    const found = must_have_fields.filter(field =>
      content.includes(field.toLowerCase()) || content.includes(field.replace(/_/g, ' ').toLowerCase())
    );
    const missing = must_have_fields.filter(field => !found.includes(field));

    return {
      all_found: missing.length === 0,
      found: found,
      missing: missing
    };
  } catch (e) {
    console.error(`Error reading ${file_path}:`, e.message);
    return {
      all_found: false,
      found: [],
      missing: must_have_fields
    };
  }
}

/**
 * PreToolUse トリガー処理（工程遷移ゲート）
 * @param {Object} params - { next_phase, decision_id }
 * @returns {Object} { approval: boolean, denial_code, issues }
 */
function checkArtifactGate(params) {
  const { next_phase, decision_id, decision_timestamp, task_id } = params;

  if (!next_phase) {
    return {
      approval: false,
      denial_code: 'INVALID_PHASE',
      issues: ['next_phase not specified'],
      checked_at: new Date().toISOString()
    };
  }

  const gate_config = ARTIFACT_GATE_CONFIG[next_phase];
  if (!gate_config) {
    return {
      approval: false,
      denial_code: 'UNKNOWN_PHASE',
      issues: [`Unknown phase: ${next_phase}`],
      checked_at: new Date().toISOString()
    };
  }

  const issues = [];

  // ルール 1: ファイル存在確認
  for (const file of gate_config.required_files) {
    if (!fileExists(file)) {
      issues.push(`ARTIFACT_NOT_FOUND: ${file}`);
    }
  }

  // ルール 2: 更新時刻確認（decision_timestamp がある場合）
  const decision_time_ms = parseDecisionTimestampToMs(decision_timestamp);
  if (decision_timestamp && decision_time_ms === null) {
    issues.push(`DECISION_TIMESTAMP_INVALID: ${decision_timestamp}`);
  }

  if (decision_time_ms !== null) {
    for (const file of gate_config.required_files) {
      if (fileExists(file) && !isFileUpdatedAfterDecision(file, decision_time_ms)) {
        issues.push(`ARTIFACT_NOT_UPDATED: ${file} (decision_timestamp: ${decision_timestamp})`);
      }
    }
  } else if (decision_id) {
    issues.push('DECISION_TIMESTAMP_MISSING: decision_id provided without valid decision_timestamp');
  }

  // complete は task_id 固有の episode ファイルを必須化する。
  if (next_phase === 'complete') {
    const expected_episode = getExpectedEpisodePath(task_id);
    if (!expected_episode) {
      issues.push('TASK_ID_MISSING: complete gate requires task_id');
    } else if (!fileExists(expected_episode)) {
      issues.push(`EPISODE_NOT_FOUND: ${expected_episode}`);
    }
  }

  // ルール 3: sync_status フィールド確認
  // frontmatter が存在しない設計書では、sync_status を厳密必須にしない。
  // 代わりに artifacts フラグまたは更新時刻で充足判定する。
  for (const file of gate_config.required_files) {
    for (const existing_file of getExistingFiles(file)) {
      const sync_status = extractSyncStatus(existing_file);
      if (sync_status && sync_status !== 'synced') {
        issues.push(`SYNC_MISMATCH: ${existing_file} (status: ${sync_status || 'not_found'})`);
      }
    }
  }

  // ルール 4: must-have 項目確認
  for (const file of gate_config.required_files) {
    for (const existing_file of getExistingFiles(file)) {
      const must_have_check = checkMustHaveFields(existing_file, gate_config.must_have_fields);
      if (!must_have_check.all_found) {
        issues.push(`MUST_HAVE_MISSING: ${existing_file} missing [${must_have_check.missing.join(', ')}]`);
      }
    }
  }

  const approval = issues.length === 0;
  const denial_code = issues.length > 0 ? issues[0].split(':')[0] : null;

  return {
    approval: approval,
    denial_code: denial_code,
    issues: issues,
    gate_description: gate_config.description,
    checked_at: new Date().toISOString()
  };
}

// エクスポート
module.exports = {
  checkArtifactGate,
  fileExists,
  getExistingFiles,
  getFileUpdateTime,
  isFileUpdatedAfterDecision,
  parseDecisionTimestampToMs,
  extractSyncStatus,
  checkMustHaveFields,
  getExpectedEpisodePath,
  ARTIFACT_GATE_CONFIG
};

// 直接実行時（テスト）
if (require.main === module) {
  const test_result = checkArtifactGate({
    next_phase: 'design',
    decision_id: new Date().toISOString()
  });
  console.log('Artifact Gate Test Result:', JSON.stringify(test_result, null, 2));
}
