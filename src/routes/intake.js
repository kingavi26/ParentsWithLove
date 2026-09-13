const express = require("express");
const { db } = require("../db");
const { requireAuth, clearSession } = require("../auth-middleware");
const { normalizeTopics } = require("../family-state");
const { INTAKE_CONCERNS } = require("../intake");

const router = express.Router();

const CONCERN_SET = new Set(INTAKE_CONCERNS);
const MAX_CHILDREN = 8;
const MAX_OTHER_CONCERN_LENGTH = 200;
const MAX_CHILD_NAME_LENGTH = 100;

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, server time — same as chat.js's todayISO
}

// One write endpoint for the whole new-parent intake wizard (public/app.js),
// called both when a parent finishes it and when they hit "Skip" on any
// step — skipping just means submitting whatever (if anything) they'd
// filled in so far, so one endpoint handles both rather than a separate
// /skip route. Idempotent against a double-submit: once has_completed_intake
// is set, a repeat call is a no-op that still reports ok, same pattern as
// POST /api/resend-verification's alreadyVerified short-circuit.
//
// Deliberately does a plain INSERT for children (not chat.js's
// mergeChildren, which exists to reconcile a new fact against rows that may
// already disagree with it) and a direct topics write: this only ever runs
// once, before a parent's first real chat message, against a family_notes
// row that's still at its just-signed-up default ('[]') — there's nothing
// meaningfully conflicting to merge against yet.
router.post("/intake", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, has_completed_intake FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }
  if (user.has_completed_intake) {
    return res.json({ ok: true, alreadyCompleted: true });
  }

  const body = req.body || {};

  // ---- children ----
  const rawChildren = Array.isArray(body.children) ? body.children.slice(0, MAX_CHILDREN) : [];
  const children = [];
  for (const c of rawChildren) {
    if (!c) continue;
    const name = c.name != null ? String(c.name).trim().slice(0, MAX_CHILD_NAME_LENGTH) : "";

    let age = null;
    if (c.age !== undefined && c.age !== null && c.age !== "") {
      const parsed = Number(c.age);
      // Same 0-17 bound as PATCH /api/account/children/:id (src/routes/account.js).
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 17) {
        return res.status(400).json({ error: "Age must be a whole number between 0 and 17." });
      }
      age = parsed;
    }

    if (!name && age == null) continue; // an entirely blank row from the wizard — skip rather than error
    children.push({ name: name || null, age });
  }

  // ---- concerns ----
  const notSureYet = Boolean(body.notSureYet);
  let concerns = [];
  if (!notSureYet) {
    const rawConcerns = Array.isArray(body.concerns) ? body.concerns : [];
    for (const concern of rawConcerns) {
      if (!CONCERN_SET.has(concern)) {
        return res.status(400).json({ error: "Unrecognized concern." });
      }
    }
    concerns = Array.from(new Set(rawConcerns));
  }

  let otherConcern = null;
  if (!notSureYet && body.otherConcern != null) {
    const trimmed = String(body.otherConcern).trim().slice(0, MAX_OTHER_CONCERN_LENGTH);
    if (trimmed) otherConcern = trimmed;
  }

  const topicTexts = concerns.slice();
  if (otherConcern) topicTexts.push(otherConcern);

  const existingRow = db.prepare("SELECT topics_discussed FROM family_notes WHERE user_id = ?").get(req.userId);
  const existingTopics = existingRow ? normalizeTopics(JSON.parse(existingRow.topics_discussed)) : [];

  let mergedTopics = existingTopics;
  if (topicTexts.length) {
    const today = todayISO();
    const byTopic = new Map(existingTopics.map((t) => [t.topic, t.lastDiscussedAt]));
    for (const topic of topicTexts) {
      byTopic.set(topic, today);
    }
    mergedTopics = Array.from(byTopic, ([topic, lastDiscussedAt]) => ({ topic, lastDiscussedAt })).slice(0, 20);
  }

  const writeIntake = db.transaction(() => {
    for (const c of children) {
      db.prepare("INSERT INTO children (user_id, name, age) VALUES (?, ?, ?)").run(req.userId, c.name, c.age);
    }
    if (topicTexts.length) {
      db.prepare(
        "UPDATE family_notes SET topics_discussed = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(JSON.stringify(mergedTopics), req.userId);
    }
    db.prepare("UPDATE users SET has_completed_intake = 1 WHERE id = ?").run(req.userId);
  });
  writeIntake();

  const updatedChildren = db.prepare("SELECT id, name, age FROM children WHERE user_id = ? ORDER BY id").all(req.userId);

  res.json({
    ok: true,
    children: updatedChildren,
    topics_discussed: mergedTopics
  });
});

module.exports = router;
