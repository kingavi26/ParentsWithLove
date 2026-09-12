const express = require("express");
const { db } = require("../db");
const { requireAdminAuth } = require("../admin-auth");
const { rateLimit, byIp } = require("../rate-limit");
const { getReply } = require("../reply-engine");

const router = express.Router();

const MAX_LEN = 1000;

// An empty family state — no children, no history — same shape
// loadFamilyState() returns for a brand-new signup before their first real
// chat message (see src/family-state.js). getReply() already handles that
// case for real accounts, so an anonymous visitor gets the same pipeline,
// just without any personalization to draw on yet.
const EMPTY_FAMILY_STATE = { children: [], topics_discussed: [], notes: [] };

// Public, unauthenticated on purpose — same reasoning as /api/beta-signup
// (src/routes/beta.js): this is the landing page's "Other" card. Rate
// limited more tightly than beta-signup/other endpoints, though, because
// this one runs the same pipeline as a real chat message — up to several
// OpenAI calls per submission once a real API key is configured (see
// src/reply-engine.js) — so it costs real money per request, not just a
// database write.
const otherIssueLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyFn: byIp,
  message: "Too many questions from this connection. Please try again later."
});

router.post("/other-issue", otherIssueLimiter, async (req, res) => {
  const text = String((req.body && req.body.text) || "").trim();

  if (!text) {
    return res.status(400).json({ error: "Please describe what you're dealing with." });
  }
  if (text.length > MAX_LEN) {
    return res.status(400).json({ error: `Please keep it under ${MAX_LEN} characters.` });
  }

  // Insert first, before the (potentially slow/failable) model call, so a
  // submission is never lost even if the reply pipeline errors out.
  const inserted = db.prepare("INSERT INTO other_issue_submissions (text) VALUES (?)").run(text);

  let reply = null;
  let sources = [];
  try {
    const result = await getReply({
      history: [{ role: "user", content: text }],
      familyState: EMPTY_FAMILY_STATE
    });
    reply = result.reply;
    sources = (result.sources || []).map((s) => ({ org: s.org, title: s.title, url: s.url }));
    db.prepare("UPDATE other_issue_submissions SET reply = ? WHERE id = ?").run(reply, inserted.lastInsertRowid);
  } catch (err) {
    // The submission is already saved either way — a visitor who hits this
    // still gets acknowledged, just without an inline answer this time.
    reply = null;
  }

  res.json({ ok: true, reply, sources });
});

// Admin-only. ?format=csv returns a downloadable file, same shape as
// GET /api/admin/beta-signups; anything else (or no param) returns JSON
// for the admin dashboard's "Other issues submitted" card.
router.get("/admin/other-issues", requireAdminAuth, (req, res) => {
  const rows = db.prepare("SELECT id, text, reply, created_at FROM other_issue_submissions ORDER BY created_at DESC").all();

  if (req.query.format === "csv") {
    const escapeCsv = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
    const lines = [
      "text,reply,submitted_at",
      ...rows.map((r) => `${escapeCsv(r.text)},${escapeCsv(r.reply)},${escapeCsv(r.created_at)}`)
    ];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="pwl7-other-issues.csv"');
    return res.send(lines.join("\n"));
  }

  res.json({ count: rows.length, submissions: rows });
});

module.exports = router;
