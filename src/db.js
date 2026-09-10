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
      token_version INTEGER NOT NULL DEFAULT 0,
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

    -- Small key/value store for admin-editable app config that needs to
    -- survive redeploys. Right now this holds one key, "base_rules" — an
    -- admin-set override of the BASE_RULES framework text in src/prompt.js
    -- — but the shape is generic so future admin-editable settings can
    -- reuse it without another migration.
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- A single-row (id always 1) queue of ONE auto-drafted update to the
    -- "Learned patterns" appendix of BASE_RULES (see src/prompt.js), built
    -- from session_reviews. This is a DRAFT only — it never touches the
    -- live prompt until an admin approves it via
    -- POST /api/admin/base-rules/pending-update/approve. Each new review
    -- with something worth folding in regenerates this row (merging into
    -- whatever's already pending) rather than queuing a growing list, so
    -- there's always at most one thing for the admin to review.
    CREATE TABLE IF NOT EXISTS base_rules_pending_update (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      learned_patterns_text TEXT NOT NULL DEFAULT '',
      change_summary TEXT NOT NULL DEFAULT '',
      source_review_ids TEXT NOT NULL DEFAULT '[]',
      review_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  // Lets an admin suspend an account (see src/routes/admin.js) without
  // deleting it — blocks both password and social login, and immediately
  // invalidates any session already in progress (see requireAuth).
  if (!columns.includes("suspended")) {
    db.exec("ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0");
  }
  // Bumped whenever a password changes (see src/routes/account.js) so every
  // other JWT already out there — on another device, in a stolen cookie —
  // stops working immediately instead of staying valid for up to 30 days.
  // Missing/old tokens are treated as version 0 (see requireAuth below), so
  // this migration doesn't invalidate anyone's existing session by itself.
  if (!columns.includes("token_version")) {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
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
