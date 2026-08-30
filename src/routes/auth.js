const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requireAuth, issueSession, clearSession } = require("../auth-middleware");
const { loadFamilyState } = require("../family-state");

const router = express.Router();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

router.post("/signup", async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const password = (req.body && req.body.password) || "";

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, passwordHash);
  db.prepare("INSERT INTO family_notes (user_id) VALUES (?)").run(result.lastInsertRowid);

  issueSession(res, result.lastInsertRowid);
  res.json({ ok: true, email });
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const password = (req.body && req.body.password) || "";

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  issueSession(res, user.id);
  res.json({ ok: true, email: user.email });
});

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }

  const familyState = loadFamilyState(req.userId);

  res.json({
    email: user.email,
    hasPassword: Boolean(user.password_hash),
    children: familyState.children,
    topics_discussed: familyState.topics_discussed,
    notes: familyState.notes,
    last_conversation_at: familyState.last_conversation_at
  });
});

module.exports = router;
