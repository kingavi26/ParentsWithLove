const express = require("express");
const { db } = require("../db");
const { requireAdminAuth } = require("../admin-auth");
const { rateLimit, byIp } = require("../rate-limit");

const router = express.Router();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  // Same intentionally-loose shape check used elsewhere in this app
  // (src/routes/auth.js) — good enough to catch typos without rejecting
  // real addresses a stricter regex would choke on.
  return Boolean(email) && email.includes("@") && email.length <= 254;
}

// Public, unauthenticated on purpose — this is the whole point of the
// landing page (public/index.html). Rate-limited by IP rather than by
// email (there's no account/session to key on here) to blunt scripted
// spam without needing a CAPTCHA.
const betaSignupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyFn: byIp,
  message: "Too many signups from this connection. Please try again later."
});

router.post("/beta-signup", betaSignupLimiter, (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const existing = db.prepare("SELECT id FROM beta_signups WHERE email = ?").get(email);
  if (existing) {
    // Not an error — someone re-submitting (or clicking the link twice)
    // should see a friendly "you're already on it", not a failure.
    return res.json({ ok: true, alreadyOnList: true });
  }

  db.prepare("INSERT INTO beta_signups (email) VALUES (?)").run(email);
  res.json({ ok: true, alreadyOnList: false });
});

// Admin-only. ?format=csv returns a downloadable file (ready to import into
// Mailchimp or any other list tool) instead of JSON; anything else (or no
// param) returns JSON for the admin dashboard's own "Beta waitlist" card.
router.get("/admin/beta-signups", requireAdminAuth, (req, res) => {
  const rows = db.prepare("SELECT email, created_at FROM beta_signups ORDER BY created_at DESC").all();

  if (req.query.format === "csv") {
    const escapeCsv = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = ["email,signed_up_at", ...rows.map((r) => `${escapeCsv(r.email)},${escapeCsv(r.created_at)}`)];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="pwl7-beta-signups.csv"');
    return res.send(lines.join("\n"));
  }

  res.json({ count: rows.length, signups: rows });
});

module.exports = router;
