const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requireAuth, issueSession, clearSession } = require("../auth-middleware");
const { loadFamilyState } = require("../family-state");
const { rateLimit, byIp, byIpAndEmail, byUserId } = require("../rate-limit");
const { sendEmail } = require("../notifications");

const router = express.Router();

const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ---------------- email verification / password reset tokens ----------------
//
// Shared helpers for the two auth_tokens purposes (src/db.js). Tokens are
// high-entropy random strings, generated fresh per email and never reused —
// storing only sha256(token) means a copy of the database on its own can't
// be replayed as a working link, the same reason passwords are hashed
// rather than stored plain (a fast hash is fine here, unlike passwords,
// because these tokens have far more entropy than anything a human could
// choose or than a brute-force attempt could feasibly search).

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createAuthToken(userId, purpose, ttlMs) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare("INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)").run(
    userId,
    hashToken(token),
    purpose,
    expiresAt
  );
  return token;
}

// Looks up an unused, unexpired token of the given purpose and marks it
// used in the same call — a token is good for exactly one successful
// verify/reset, never replayable even within its own expiry window.
// Returns the user_id it belonged to, or null if the token is missing,
// wrong purpose, expired, or already used.
function consumeAuthToken(token, purpose) {
  if (!token) return null;
  const row = db
    .prepare("SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?")
    .get(hashToken(token), purpose);
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return row.user_id;
}

// Each of these builds its own plain-text body rather than relying on
// notifications.js's default html-tag-stripping fallback — that fallback
// drops <a href> entirely (only the link text survives), which would ship
// a "verify your email" text email with no actual link in it. The one
// piece of information that matters in either of these emails is the URL,
// so it's spelled out in the text version explicitly.

function verificationEmail(link) {
  const html = `
    <p>Welcome to Parents with Love — please confirm this is your email address.</p>
    <p><a href="${link}">Verify my email</a></p>
    <p>This link works for 24 hours. If you didn't create an account, you can ignore this email.</p>
  `;
  const text =
    "Welcome to Parents with Love — please confirm this is your email address.\n\n" +
    `Verify my email: ${link}\n\n` +
    "This link works for 24 hours. If you didn't create an account, you can ignore this email.";
  return { subject: "Verify your email — Parents with Love", html, text };
}

function passwordResetEmail(link) {
  const html = `
    <p>We got a request to reset the password for your Parents with Love account.</p>
    <p><a href="${link}">Choose a new password</a></p>
    <p>This link works for 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.</p>
  `;
  const text =
    "We got a request to reset the password for your Parents with Love account.\n\n" +
    `Choose a new password: ${link}\n\n` +
    "This link works for 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.";
  return { subject: "Reset your password — Parents with Love", html, text };
}

function noPasswordEmail() {
  const html = `
    <p>We got a request to reset the password for this email's Parents with Love account.</p>
    <p>This account signs in with Google or Facebook and doesn't have a separate password to reset —
       just use "Continue with Google" or "Continue with Facebook" on the login screen instead.</p>
    <p>If you didn't ask for this, you can ignore this email.</p>
  `;
  const text =
    "We got a request to reset the password for this email's Parents with Love account.\n\n" +
    'This account signs in with Google or Facebook and doesn\'t have a separate password to reset — ' +
    'just use "Continue with Google" or "Continue with Facebook" on the login screen instead.\n\n' +
    "If you didn't ask for this, you can ignore this email.";
  return { subject: "About your Parents with Love account", html, text };
}

async function sendVerificationEmail(user) {
  const token = createAuthToken(user.id, "email_verify", 24 * 60 * 60 * 1000);
  const link = `${APP_BASE_URL}/api/verify-email?token=${token}`;
  const { subject, html, text } = verificationEmail(link);
  const result = await sendEmail({ to: user.email, subject, html, text });
  if (!result.sent) {
    console.warn(`[pwl7] Verification email to ${user.email} was not actually sent (${result.error}).`);
  }
  return result;
}

// ---------------- rate limiting ----------------
//
// Login/signup rate limiting: a per-IP limit blunts scripted abuse from one
// source in general, and a tighter per-IP+email limit specifically slows
// credential-stuffing/brute-force against one parent account (which holds
// real facts about real kids) without locking out everyone behind a shared
// IP (e.g. a school or office network) just because of one bad actor.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  keyFn: byIp,
  message: "Too many accounts created from this connection recently. Please try again later."
});

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: byIp,
  message: "Too many login attempts from this connection. Please try again in a few minutes."
});

const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyFn: byIpAndEmail,
  message: "Too many failed attempts for this account. Please wait a few minutes and try again."
});

// Forgot-password is a free, unauthenticated way to trigger an email send —
// needs its own limiter pair so it can't be used to spam an inbox or burn
// through the email provider's quota. Same per-IP + per-IP-and-email
// pattern as login above, just more generous since "I forgot my password"
// is a legitimate thing to retry a couple of times.
const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyFn: byIp,
  message: "Too many password reset requests from this connection. Please try again later."
});

const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 4,
  keyFn: byIpAndEmail,
  message: "Too many password reset requests for this account. Please check your inbox or try again later."
});

// Applied after requireAuth, so req.userId is already set — keyed by
// account rather than IP for the same reason byUserId exists elsewhere
// (rate-limit.js): a shared office/school IP shouldn't throttle everyone
// just because one of them clicked resend a lot.
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyFn: byUserId,
  message: "Too many verification emails requested. Please check your inbox (and spam folder) or try again later."
});

// Verify-email tokens are unguessable (32 random bytes), so this is just a
// light backstop against someone hammering the endpoint, not a real defense
// need — generous enough that it never gets in a real user's way.
const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: byIp,
  message: "Too many attempts. Please try again in a few minutes."
});

// ---------------- routes ----------------

router.post("/signup", signupLimiter, async (req, res) => {
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

  // Fire after responding — a slow or failing email provider should never
  // make signup itself feel slow or broken; sendVerificationEmail already
  // catches and logs its own failures.
  sendVerificationEmail({ id: result.lastInsertRowid, email }).catch((err) => {
    console.error("[pwl7] sendVerificationEmail threw unexpectedly:", err);
  });
});

router.post("/login", loginIpLimiter, loginEmailLimiter, async (req, res) => {
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

  if (user.suspended) {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  issueSession(res, user.id, user.token_version);
  res.json({ ok: true, email: user.email });
});

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, email, password_hash, email_verified, has_completed_intake FROM users WHERE id = ?")
    .get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }

  const familyState = loadFamilyState(req.userId);

  res.json({
    email: user.email,
    hasPassword: Boolean(user.password_hash),
    emailVerified: Boolean(user.email_verified),
    hasCompletedIntake: Boolean(user.has_completed_intake),
    children: familyState.children,
    topics_discussed: familyState.topics_discussed,
    notes: familyState.notes,
    last_conversation_at: familyState.last_conversation_at
  });
});

// Public, hit by clicking the link in the verification email — not an
// API call from the frontend, so it redirects rather than returning JSON.
// Query param (not a route param) to match the plain-GET-link-in-an-email
// pattern used everywhere else this app does that (OAuth callbacks aside).
router.get("/verify-email", verifyEmailLimiter, (req, res) => {
  const token = String(req.query.token || "");
  const userId = consumeAuthToken(token, "email_verify");
  if (!userId) {
    return res.redirect("/app?verified=0");
  }

  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
  res.redirect("/app?verified=1");
});

router.post("/resend-verification", requireAuth, resendVerificationLimiter, async (req, res) => {
  const user = db.prepare("SELECT id, email, email_verified FROM users WHERE id = ?").get(req.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }
  if (user.email_verified) {
    return res.json({ ok: true, alreadyVerified: true });
  }

  await sendVerificationEmail(user);
  res.json({ ok: true });
});

// Deliberately responds the same way whether or not an account exists for
// the given email (and whether or not it has a password) — otherwise this
// endpoint would let anyone check which email addresses have accounts here,
// simply by watching which ones get a different response.
router.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordEmailLimiter, async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const genericResponse = {
    ok: true,
    message: "If an account exists for that email, we've sent a link to reset the password."
  };

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  res.json(genericResponse);

  if (!user) return;

  if (!user.password_hash) {
    // Social-only account — nothing to reset, but tell the actual owner
    // that rather than silently doing nothing, in case they've forgotten
    // how they originally signed up.
    const { subject, html, text } = noPasswordEmail();
    sendEmail({ to: user.email, subject, html, text }).catch(() => {});
    return;
  }

  const token = createAuthToken(user.id, "password_reset", 60 * 60 * 1000);
  const link = `${APP_BASE_URL}/app?resetToken=${token}`;
  const { subject, html, text } = passwordResetEmail(link);
  sendEmail({ to: user.email, subject, html, text }).catch((err) => {
    console.error("[pwl7] sendEmail (password reset) threw unexpectedly:", err);
  });
});

router.post("/reset-password", async (req, res) => {
  const token = String((req.body && req.body.token) || "");
  const newPassword = (req.body && req.body.newPassword) || "";

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const userId = consumeAuthToken(token, "password_reset");
  if (!userId) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
  }

  const user = db.prepare("SELECT id, email, token_version FROM users WHERE id = ?").get(userId);
  if (!user) {
    return res.status(400).json({ error: "This account no longer exists." });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  // Bump token_version so any other outstanding session (e.g. whoever
  // triggered "forgot password" because someone else has the old one) is
  // invalidated immediately — same reasoning as account.js's own password
  // change. Re-issuing a session below signs this device in with the new
  // password, so resetting doubles as logging in.
  const nextTokenVersion = (user.token_version || 0) + 1;
  db.prepare("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?").run(
    newHash,
    nextTokenVersion,
    user.id
  );

  issueSession(res, user.id, nextTokenVersion);
  res.json({ ok: true, email: user.email });
});

module.exports = router;
