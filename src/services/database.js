const Database = require('better-sqlite3');
const path = require('path');

function createDatabase(dbPath) {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      productive INTEGER,
      activity TEXT,
      message TEXT,
      task_context TEXT,
      roast_level TEXT
    );
  `);

  // Prepare statements for reuse
  const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSettingStmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const addHistoryStmt = db.prepare(
    'INSERT INTO history (timestamp, productive, activity, message, task_context, roast_level) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const getHistoryStmt = db.prepare(
    'SELECT * FROM history ORDER BY id DESC LIMIT ?'
  );
  const clearHistoryStmt = db.prepare('DELETE FROM history');
  const totalChecksStmt = db.prepare('SELECT COUNT(*) AS count FROM history');
  const productiveChecksStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM history WHERE productive = 1'
  );
  const todayChecksStmt = db.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN productive = 1 THEN 1 ELSE 0 END) AS productive FROM history WHERE date(timestamp) = date(?)'
  );
  const allProductiveValuesStmt = db.prepare(
    'SELECT productive FROM history ORDER BY id ASC'
  );

  function getSetting(key) {
    const row = getSettingStmt.get(key);
    return row ? row.value : null;
  }

  function setSetting(key, value) {
    setSettingStmt.run(key, value);
  }

  function addHistoryEntry({ productive, activity, message, taskContext, roastLevel }) {
    const timestamp = new Date().toISOString();
    addHistoryStmt.run(
      timestamp,
      productive ? 1 : 0,
      activity || null,
      message || null,
      taskContext || null,
      roastLevel || null
    );
  }

  function getHistory(limit = 50) {
    return getHistoryStmt.all(limit);
  }

  function clearHistory() {
    clearHistoryStmt.run();
  }

  function getStats() {
    const totalChecks = totalChecksStmt.get().count;
    const productiveChecks = productiveChecksStmt.get().count;

    // Today's score
    const today = new Date().toISOString().split('T')[0];
    const todayRow = todayChecksStmt.get(today);
    const todayTotal = todayRow.total || 0;
    const todayProductive = todayRow.productive || 0;
    const todayScore = todayTotal > 0 ? Math.round((todayProductive / todayTotal) * 100) : 0;

    // Streak calculations
    const rows = allProductiveValuesStmt.all();
    let currentStreak = 0;
    let bestStreak = 0;
    let streak = 0;

    for (const row of rows) {
      if (row.productive === 1) {
        streak++;
        if (streak > bestStreak) {
          bestStreak = streak;
        }
      } else {
        streak = 0;
      }
    }

    // Current streak: consecutive productive from the most recent entry backwards
    currentStreak = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].productive === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      totalChecks,
      productiveChecks,
      currentStreak,
      bestStreak,
      todayScore,
    };
  }

  return {
    getSetting,
    setSetting,
    addHistoryEntry,
    getHistory,
    clearHistory,
    getStats,
    db, // expose raw db for close/advanced usage
  };
}

module.exports = { createDatabase };
