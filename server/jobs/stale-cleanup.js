const logger = require("../lib/logger");

const STALE_THRESHOLD_MINUTES = 30;
const CLEANUP_INTERVAL_MS = 60 * 1000;

function cleanupStaleSessions(db) {
  const result = db.prepare(`
    UPDATE sessions
    SET status = 'stale', file_claims = '[]'
    WHERE status != 'stale'
      AND last_heartbeat < datetime('now', '-${STALE_THRESHOLD_MINUTES} minutes')
  `).run();

  if (result.changes > 0) {
    logger.info("stale sessions cleaned", { count: result.changes });
  }

  return result.changes;
}

function startStaleCleanup(db) {
  logger.info("stale cleanup scheduler started", { intervalMs: CLEANUP_INTERVAL_MS, thresholdMinutes: STALE_THRESHOLD_MINUTES });
  setInterval(() => cleanupStaleSessions(db), CLEANUP_INTERVAL_MS);
}

module.exports = { cleanupStaleSessions, startStaleCleanup };
