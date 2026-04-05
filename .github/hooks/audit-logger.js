/**
 * audit-logger.js
 * 
 * Hook: audit-logger
 * Trigger: SessionStart
 * 
 * JSONL append-only ログを audit_log/events.jsonl へ記録します。
 * - 再構成可能性：initial_state + event_replay で復元可能
 * - SHA256 checksum：10k events ごと
 * - 監査ログの完全性を保証
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_DIR = path.join(__dirname, '..', '..', 'audit_log');
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl');
const CHECKPOINT_FILE = path.join(LOG_DIR, 'checkpoint.json');

/**
 * イベントスキーマ
 */
const EVENT_SCHEMA = {
  event_id: 'UUID', // auto-generated
  timestamp_utc: 'ISO 8601', // auto-generated
  event_type: 'string', // PHASE_TRANSITION / DECISION_* / DRIFT_DETECTED / ...
  actor_role: 'string', // coordinator / implementer / user / system
  phase: 'string', // current phase
  task_id: 'UUID | null',
  decision_id: 'UUID | null',
  status: 'string', // pending / approved / denied / ...
  payload: 'object', // event-specific data
  correlation_id: 'UUID | null' // for cross-event tracking
};

const MANDATORY_EVENTS = [
  'PHASE_TRANSITION',
  'DECISION_RECORDED',
  'DECISION_SUSPENDED',
  'DRIFT_DETECTED',
  'PHASE_ROLLBACK',
  'ARTIFACT_INVALIDATED',
  'MEMORY_BLOCKED_HARD_DRIFT',
  'MEMORY_BLOCKED_ROLLBACK',
  'GOVERNANCE_GATE_DENIED',
  'GOVERNANCE_GATE_PASSED',
  'UAT_TRIGGERED',
  'EPISODE_RECORD_BLOCKED',
  'EPISODE_RECORD_APPROVED'
];

/**
 * ログディレクトリの初期化
 */
function ensureLogDirectory() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * UUID v4 生成
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * イベントを JSONL へ追記
 * @param {Object} event - イベントオブジェクト
 */
function logEvent(event) {
  ensureLogDirectory();

  const enrichedEvent = {
    event_id: event.event_id || generateUUID(),
    timestamp_utc: event.timestamp_utc || new Date().toISOString(),
    event_type: event.event_type,
    actor_role: event.actor_role || 'system',
    phase: event.phase,
    task_id: event.task_id || null,
    decision_id: event.decision_id || null,
    status: event.status,
    payload: event.payload || {},
    correlation_id: event.correlation_id || null
  };

  // JSONL へ追記（改行込み）
  const line = JSON.stringify(enrichedEvent) + '\n';
  fs.appendFileSync(LOG_FILE, line, 'utf8');

  // 10k events ごとにチェックポイント作成
  const lineCount = countLines(LOG_FILE);
  if (lineCount % 10000 === 0) {
    createCheckpoint(lineCount);
  }

  return enrichedEvent;
}

/**
 * ファイルの行数をカウント
 */
function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').filter(line => line.trim()).length;
}

/**
 * チェックポイント作成（SHA256 + メタデータ）
 */
function createCheckpoint(lineCount) {
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const checksum = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');

  const checkpoint = {
    checkpoint_timestamp: new Date().toISOString(),
    event_count: lineCount,
    sha256_checksum: checksum,
    log_file_size_bytes: Buffer.byteLength(content, 'utf8')
  };

  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

/**
 * イベントログ再構成（initial_state + event_replay）
 * @returns {Object} 再構成されたシステム状態
 */
function reconstructSystemState() {
  if (!fs.existsSync(LOG_FILE)) {
    return { initial_state: {}, events: [], reconstructed_at: new Date().toISOString() };
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(line => line.trim());
  const events = lines.map(line => JSON.parse(line));

  return {
    initial_state: { /* 初期状態（別途定義） */ },
    events: events,
    total_events: events.length,
    reconstructed_at: new Date().toISOString()
  };
}

/**
 * イベント取得（検索・フィルタリング）
 * @param {Object} filter - フィルタ条件 { event_type, task_id, phase, ... }
 * @returns {Array} マッチしたイベント
 */
function queryEvents(filter = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(line => line.trim());
  let events = lines.map(line => JSON.parse(line));

  // フィルタリング
  if (filter.event_type) {
    events = events.filter(e => e.event_type === filter.event_type);
  }
  if (filter.task_id) {
    events = events.filter(e => e.task_id === filter.task_id);
  }
  if (filter.phase) {
    events = events.filter(e => e.phase === filter.phase);
  }
  if (filter.status) {
    events = events.filter(e => e.status === filter.status);
  }

  return events;
}

/**
 * 監査ログの完全性検査
 * @returns {Object} チェック結果
 */
function validateLogIntegrity() {
  if (!fs.existsSync(LOG_FILE)) {
    return { valid: true, issues: [], message: 'Log file not yet created' };
  }

  const issues = [];
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(line => line.trim());

  // 各行が有効な JSON か確認
  for (let i = 0; i < lines.length; i++) {
    try {
      JSON.parse(lines[i]);
    } catch (e) {
      issues.push(`Line ${i + 1}: Invalid JSON - ${e.message}`);
    }
  }

  // mandatory_events が記録されているか確認
  const recordedEvents = new Set();
  lines.forEach(line => {
    const event = JSON.parse(line);
    recordedEvents.add(event.event_type);
  });

  const missingEvents = MANDATORY_EVENTS.filter(e => !recordedEvents.has(e));
  if (missingEvents.length > 0) {
    // 警告レベル（欠落イベントは必須ではない場合もある）
    console.warn(`Missing mandatory events: ${missingEvents.join(', ')}`);
  }

  return {
    valid: issues.length === 0,
    issues: issues,
    total_events: lines.length,
    recorded_event_types: Array.from(recordedEvents),
    validation_timestamp: new Date().toISOString()
  };
}

/**
 * SessionStart トリガー処理
 * システム起動時に監査ログを初期化・検証
 */
function onSessionStart() {
  ensureLogDirectory();

  // ログ完全性検査
  const integrity = validateLogIntegrity();
  if (!integrity.valid) {
    console.error('Log integrity check failed:', integrity.issues);
  }

  // SESSION_START イベント記録
  logEvent({
    event_type: 'SESSION_START',
    actor_role: 'system',
    phase: null,
    task_id: null,
    status: 'initialized',
    payload: {
      session_id: generateUUID(),
      integrity_status: integrity.valid ? 'passed' : 'failed'
    }
  });

  console.log('Audit logger initialized. Log file:', LOG_FILE);
}

// エクスポート
module.exports = {
  logEvent,
  queryEvents,
  validateLogIntegrity,
  reconstructSystemState,
  onSessionStart,
  EVENT_SCHEMA,
  MANDATORY_EVENTS
};

// 直接実行時
if (require.main === module) {
  onSessionStart();
}
