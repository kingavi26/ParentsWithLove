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
      password_hash TEXT NOT NULL,
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { db, initDb };
