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
    console.log(`[stale-cleanup] Marked ${result.changes} session(s) as stale`);
  }

  return result.changes;
}

function startStaleCleanup(db) {
  setInterval(() => cleanupStaleSessions(db), CLEANUP_INTERVAL_MS);
}

module.exports = { cleanupStaleSessions, startStaleCleanup };
