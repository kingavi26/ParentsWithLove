const express = require("express");
const { db } = require("../db");
const {
  isAdminAvailable,
  checkAdminCredentials,
  issueAdminSession,
  clearAdminSession,
  hasValidAdminSession,
  requireAdminAuth
} = require("../admin-auth");
const { rateLimit, byIp } = require("../rate-limit");
const {
  DEFAULT_BASE_RULES,
  getActiveBaseRules,
  isBaseRulesCustomized,
  setBaseRulesOverride,
  clearBaseRulesOverride
} = require("../prompt");

const router = express.Router();

// ---------------- admin auth ----------------

// Unauthenticated on purpose — lets the admin frontend know whether to even
// show a login form (adminAvailable is false until ADMIN_EMAIL/PASSWORD are
// set) and whether the current browser already has a valid admin session.
router.get("/admin/status", (req, res) => {
  res.json({
    available: isAdminAvailable,
    loggedIn: hasValidAdminSession(req)
  });
});

// Stricter than the parent-facing login limiter (src/routes/auth.js) — this
// is the single account that can see every family's data at once, so it's
// worth being more conservative here even though only Avi is expected to
// use it.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyFn: byIp,
  message: "Too many admin login attempts from this connection. Please try again later."
});

router.post("/admin/login", adminLoginLimiter, (req, res) => {
  if (!isAdminAvailable) return res.status(404).end();
  const email = (req.body && req.body.email) || "";
  const password = (req.body && req.body.password) || "";

  if (!checkAdminCredentials(email, password)) {
    return res.status(401).json({ error: "Incorrect admin email or password." });
  }

  issueAdminSession(res);
  res.json({ ok: true });
});

router.post("/admin/logout", (req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

// ---------------- overview ----------------

router.get("/admin/overview", requireAdminAuth, (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const withGoogle = db.prepare("SELECT COUNT(*) AS n FROM users WHERE google_id IS NOT NULL").get().n;
  const withFacebook = db.prepare("SELECT COUNT(*) AS n FROM users WHERE facebook_id IS NOT NULL").get().n;
  const passwordOnly = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL AND google_id IS NULL AND facebook_id IS NULL")
    .get().n;
  const suspended = db.prepare("SELECT COUNT(*) AS n FROM users WHERE suspended = 1").get().n;
  const totalChildren = db.prepare("SELECT COUNT(*) AS n FROM children").get().n;
  const totalReviews = db.prepare("SELECT COUNT(*) AS n FROM session_reviews").get().n;
  const avgScoreRow = db.prepare("SELECT AVG(overall_score) AS avg FROM session_reviews WHERE overall_score IS NOT NULL").get();
  const recentSignups = db
    .prepare("SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 10")
    .all();

  res.json({
    totalUsers,
    withGoogle,
    withFacebook,
    passwordOnly,
    suspended,
    totalChildren,
    totalReviews,
    avgOverallScore: avgScoreRow.avg != null ? Math.round(avgScoreRow.avg * 10) / 10 : null,
    recentSignups
  });
});

// ---------------- users ----------------

function userSummary(row) {
  const childrenCount = db.prepare("SELECT COUNT(*) AS n FROM children WHERE user_id = ?").get(row.id).n;
  const notesRow = db.prepare("SELECT last_message_at FROM family_notes WHERE user_id = ?").get(row.id);
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_id),
    hasFacebook: Boolean(row.facebook_id),
    suspended: Boolean(row.suspended),
    childrenCount,
    lastConversationAt: notesRow ? notesRow.last_message_at : null
  };
}

router.get("/admin/users", requireAdminAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  res.json({ users: rows.map(userSummary) });
});

router.get("/admin/users/:id", requireAdminAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "No account with that id." });

  const children = db.prepare("SELECT name, age FROM children WHERE user_id = ? ORDER BY id").all(id);
  const notesRow = db.prepare("SELECT topics_discussed, notes, last_message_at FROM family_notes WHERE user_id = ?").get(id);
  const reviews = db
    .prepare("SELECT id, overall_score, created_at FROM session_reviews WHERE user_id = ? ORDER BY id DESC")
    .all(id)
    .map((r) => ({ id: r.id, overallScore: r.overall_score, createdAt: r.created_at }));

  res.json({
    ...userSummary(row),
    children,
    topicsDiscussed: notesRow ? JSON.parse(notesRow.topics_discussed) : [],
    notes: notesRow ? JSON.parse(notesRow.notes) : [],
    reviews
  });
});

router.patch("/admin/users/:id", requireAdminAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "No account with that id." });

  if (typeof (req.body && req.body.suspended) !== "boolean") {
    return res.status(400).json({ error: "Expected { suspended: true|false }." });
  }

  db.prepare("UPDATE users SET suspended = ? WHERE id = ?").run(req.body.suspended ? 1 : 0, id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json(userSummary(updated));
});

router.delete("/admin/users/:id", requireAdminAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "No account with that id." });

  if (!(req.body && req.body.confirm === true)) {
    return res.status(400).json({ error: "Expected { confirm: true }." });
  }

  const deleteEverything = db.transaction((userId) => {
    db.prepare("DELETE FROM session_reviews WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM children WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM family_notes WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  deleteEverything(id);

  res.json({ ok: true });
});

// ---------------- session reviews ----------------

// Replaces the old ADMIN_KEY-gated GET /api/admin/reviews (src/routes/review.js,
// removed) now that there's real admin auth — the ADMIN_KEY env var is no
// longer read anywhere and can be removed from Render whenever convenient.
router.get("/admin/reviews", requireAdminAuth, (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const rows = userId
    ? db.prepare("SELECT * FROM session_reviews WHERE user_id = ? ORDER BY id DESC LIMIT 200").all(userId)
    : db.prepare("SELECT * FROM session_reviews ORDER BY id DESC LIMIT 200").all();

  const emailByUserId = new Map(db.prepare("SELECT id, email FROM users").all().map((u) => [u.id, u.email]));

  const reviews = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: emailByUserId.get(r.user_id) || null,
    overallScore: r.overall_score,
    dimensionScores: JSON.parse(r.dimension_scores),
    strengths: JSON.parse(r.strengths),
    concerns: JSON.parse(r.concerns),
    missedOpportunities: JSON.parse(r.missed_opportunities),
    suggestedPromptChanges: JSON.parse(r.suggested_prompt_changes),
    messageCount: r.message_count,
    createdAt: r.created_at
  }));
  res.json({ reviews });
});

// ---------------- live prompt editing ----------------

router.get("/admin/prompt", requireAdminAuth, (req, res) => {
  res.json({
    current: getActiveBaseRules(),
    isCustomized: isBaseRulesCustomized(),
    default: DEFAULT_BASE_RULES
  });
});

router.post("/admin/prompt", requireAdminAuth, (req, res) => {
  const text = (req.body && req.body.text) || "";
  if (!text.trim()) {
    return res.status(400).json({ error: "Prompt text can't be empty." });
  }
  setBaseRulesOverride(text);
  res.json({ ok: true, isCustomized: true });
});

router.post("/admin/prompt/reset", requireAdminAuth, (req, res) => {
  clearBaseRulesOverride();
  res.json({ ok: true, isCustomized: false, current: DEFAULT_BASE_RULES });
});

module.exports = router;
