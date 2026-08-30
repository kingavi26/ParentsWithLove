const Database = require("better-sqlite3");
const path = require("path");

// A single SQLite file holds everything. Fine for one small site's worth
// of users; if this ever needs to scale past that, swap this file for a
// Postgres client and keep the same function signatures below.
//
// DB_PATH lets a host with a persistent disk (e.g. Render) point this at a
// mounted volume so the file survives redeploys. Unset it and nothing
// changes from before — same relative data.sqlite next to the app.
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_id TEXT,
      facebook_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per child we've learned about, per family.
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT,
      age INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per family: everything else we remember, as small
    -- structured lists rather than a full transcript.
    CREATE TABLE IF NOT EXISTS family_notes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      topics_discussed TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '[]',
      last_message_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per "rate this session" click: the assistant's self-critique
    -- of its own replies in that conversation, judged against both the
    -- pwl7 framework and general child development research. Used to spot
    -- patterns worth folding back into BASE_RULES in src/prompt.js.
    CREATE TABLE IF NOT EXISTS session_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      overall_score REAL,
      dimension_scores TEXT NOT NULL DEFAULT '{}',
      strengths TEXT NOT NULL DEFAULT '[]',
      concerns TEXT NOT NULL DEFAULT '[]',
      missed_opportunities TEXT NOT NULL DEFAULT '[]',
      suggested_prompt_changes TEXT NOT NULL DEFAULT '[]',
      message_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration path for a users table created before social login existed
  // (password_hash was NOT NULL and there was no google_id/facebook_id).
  // Matters once a persistent disk is attached; a no-op on the current
  // ephemeral deploy since the table above is always created fresh there.
  const columns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!columns.includes("google_id")) {
    db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  }
  if (!columns.includes("facebook_id")) {
    db.exec("ALTER TABLE users ADD COLUMN facebook_id TEXT");
  }

  // Migration path for a family_notes table created before conversations
  // were timestamped. Left NULL for existing rows (we genuinely don't know
  // when their last message was) rather than backfilling a guess.
  const familyNotesColumns = db.prepare("PRAGMA table_info(family_notes)").all().map((c) => c.name);
  if (!familyNotesColumns.includes("last_message_at")) {
    db.exec("ALTER TABLE family_notes ADD COLUMN last_message_at TEXT");
  }
}

module.exports = { db, initDb };
