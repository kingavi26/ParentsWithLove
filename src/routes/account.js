const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requireAuth, clearSession } = require("../auth-middleware");

const router = express.Router();

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

module.exports = router;
