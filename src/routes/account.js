const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requireAuth, clearSession } = require("../auth-middleware");
const { loadFamilyState, normalizeTopics, normalizeNotes } = require("../family-state");

const router = express.Router();

// "Download what we remember" — lets a parent verify nothing's hidden
// rather than take it on faith, and gives them a portable copy before
// deleting anything. Deliberately mirrors exactly what the "What we
// remember" sidebar and the account-settings children list already show
// them — this isn't a raw database dump, just the same family-scoped facts
// in a downloadable form, plus their own self-review history.
router.get("/account/export", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }

  const familyState = loadFamilyState(req.userId);

  const reviews = db
    .prepare(
      "SELECT id, overall_score, dimension_scores, strengths, concerns, missed_opportunities, suggested_prompt_changes, message_count, created_at FROM session_reviews WHERE user_id = ? ORDER BY id"
    )
    .all(req.userId)
    .map((r) => ({
      id: r.id,
      overallScore: r.overall_score,
      dimensionScores: JSON.parse(r.dimension_scores),
      strengths: JSON.parse(r.strengths),
      concerns: JSON.parse(r.concerns),
      missedOpportunities: JSON.parse(r.missed_opportunities),
      suggestedPromptChanges: JSON.parse(r.suggested_prompt_changes),
      messageCount: r.message_count,
      createdAt: r.created_at
    }));

  res.setHeader("Content-Disposition", 'attachment; filename="parentswithlove-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.created_at },
    children: familyState.children,
    topicsDiscussed: familyState.topics_discussed,
    notes: familyState.notes,
    lastConversationAt: familyState.last_conversation_at,
    sessionReviews: reviews
  });
});

// Change password (or set one for the first time, if this account was
// created via Google/Facebook and has no password_hash yet). When there's
// already a password on file, the current one must be verified first;
// social-only accounts have nothing to verify against, so setting a
// password is allowed without that step.
router.post("/account/password", requireAuth, async (req, res) => {
  const currentPassword = (req.body && req.body.currentPassword) || "";
  const newPassword = (req.body && req.body.newPassword) || "";

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }

  if (user.password_hash) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Please enter your current password." });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);

  res.json({ ok: true, hasPassword: true });
});

// Permanently deletes the account and everything tied to it (children,
// remembered topics/notes, self-review history). Confirmation is the
// account's own email typed back exactly — works the same way whether the
// account has a password or is social-only, and the existing session cookie
// is already proof of being logged in, so this isn't relying on the typed
// email as the only safeguard, just as accidental-click protection.
router.delete("/account", requireAuth, (req, res) => {
  const confirmEmail = String((req.body && req.body.confirmEmail) || "").trim().toLowerCase();

  const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }

  if (!confirmEmail || confirmEmail !== user.email.toLowerCase()) {
    return res.status(400).json({ error: "Type your account email exactly to confirm deletion." });
  }

  const deleteEverything = db.transaction((userId) => {
    db.prepare("DELETE FROM session_reviews WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM children WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM family_notes WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  deleteEverything(user.id);

  clearSession(res);
  res.json({ ok: true });
});

// Fix or remove one remembered child directly, rather than only being able
// to nuke every remembered fact via full account deletion. Mainly exists
// for the "Unnamed child" case: fact-extraction sometimes learns an age
// without a name (or vice versa) from a single message, and while
// mergeChildren (src/routes/chat.js) now tries to auto-attach a later
// name/age onto that same row when there's exactly one unambiguous
// candidate, it deliberately won't guess when that's ambiguous (e.g. two
// kids with no name yet) — so a parent needs a way to fix it by hand too.
router.patch("/account/children/:id", requireAuth, (req, res) => {
  const childId = parseInt(req.params.id, 10);
  if (!Number.isInteger(childId)) {
    return res.status(400).json({ error: "Invalid child id." });
  }

  const existing = db.prepare("SELECT id, name, age FROM children WHERE id = ? AND user_id = ?").get(childId, req.userId);
  if (!existing) {
    return res.status(404).json({ error: "No remembered child with that id." });
  }

  const body = req.body || {};
  let nextName = existing.name;
  if (body.name !== undefined) {
    const trimmed = String(body.name || "").trim();
    nextName = trimmed || null;
  }

  let nextAge = existing.age;
  if (body.age !== undefined) {
    if (body.age === null || body.age === "") {
      nextAge = null;
    } else {
      const parsed = Number(body.age);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 17) {
        return res.status(400).json({ error: "Age must be a whole number between 0 and 17." });
      }
      nextAge = parsed;
    }
  }

  if (nextName == null && nextAge == null) {
    return res.status(400).json({ error: "A remembered child needs a name or an age — delete it instead if it's wrong." });
  }

  db.prepare("UPDATE children SET name = ?, age = ?, updated_at = datetime('now') WHERE id = ?").run(
    nextName,
    nextAge,
    existing.id
  );

  res.json({ ok: true, child: { id: existing.id, name: nextName, age: nextAge } });
});

router.delete("/account/children/:id", requireAuth, (req, res) => {
  const childId = parseInt(req.params.id, 10);
  if (!Number.isInteger(childId)) {
    return res.status(400).json({ error: "Invalid child id." });
  }

  const result = db.prepare("DELETE FROM children WHERE id = ? AND user_id = ?").run(childId, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "No remembered child with that id." });
  }

  res.json({ ok: true });
});

// Forget one remembered topic or note, rather than only being able to clear
// everything via full account deletion. Unlike children, topics/notes have
// no id column — they live as a single JSON array per family (family_notes,
// see src/db.js) — so the entry to remove is identified by its own exact
// text. That's safe because mergeTopics/mergeNotes (src/routes/chat.js)
// already dedupe on that same text before ever writing a row, so within one
// family's array a given topic or note string can only ever appear once.
router.delete("/account/topics/:topic", requireAuth, (req, res) => {
  const topic = req.params.topic;
  if (!topic) {
    return res.status(400).json({ error: "Invalid topic." });
  }

  const row = db.prepare("SELECT topics_discussed FROM family_notes WHERE user_id = ?").get(req.userId);
  const topics = row ? normalizeTopics(JSON.parse(row.topics_discussed)) : [];
  const next = topics.filter((t) => t.topic !== topic);
  if (next.length === topics.length) {
    return res.status(404).json({ error: "No remembered topic with that text." });
  }

  db.prepare("UPDATE family_notes SET topics_discussed = ?, updated_at = datetime('now') WHERE user_id = ?").run(
    JSON.stringify(next),
    req.userId
  );

  res.json({ ok: true });
});

router.delete("/account/notes/:text", requireAuth, (req, res) => {
  const text = req.params.text;
  if (!text) {
    return res.status(400).json({ error: "Invalid note." });
  }

  const row = db.prepare("SELECT notes FROM family_notes WHERE user_id = ?").get(req.userId);
  const notes = row ? normalizeNotes(JSON.parse(row.notes)) : [];
  const next = notes.filter((n) => n.text !== text);
  if (next.length === notes.length) {
    return res.status(404).json({ error: "No remembered note with that text." });
  }

  db.prepare("UPDATE family_notes SET notes = ?, updated_at = datetime('now') WHERE user_id = ?").run(
    JSON.stringify(next),
    req.userId
  );

  res.json({ ok: true });
});

module.exports = router;
