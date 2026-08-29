const express = require("express");
const { db } = require("../db");
const { issueSession } = require("../auth-middleware");
const oauth = require("../oauth");

const router = express.Router();
const STATE_COOKIE = "pwl7_oauth_state";

function setStateCookie(res, state) {
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000
  });
}

function stateIsValid(req) {
  const cookieState = req.cookies && req.cookies[STATE_COOKIE];
  return Boolean(cookieState) && cookieState === req.query.state;
}

// Finds an existing account by provider id, then by email (linking this
// provider onto it), or creates a brand-new social-only account (no
// password_hash). Only ever links onto an existing account when the
// provider has confirmed the email is real and owned by whoever is
// signing in — never on an unverified email, so a stranger can't claim
// someone else's existing account just by typing their email address
// into a throwaway social profile.
function findOrCreateSocialUser({ column, providerId, email, emailVerified }) {
  let user = db.prepare(`SELECT * FROM users WHERE ${column} = ?`).get(providerId);
  if (user) return user;

  if (email && emailVerified) {
    user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (user) {
      db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(providerId, user.id);
      return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
  }

  if (!email) {
    throw new Error("NO_EMAIL");
  }

  const result = db
    .prepare(`INSERT INTO users (email, password_hash, ${column}) VALUES (?, NULL, ?)`)
    .run(email, providerId);
  db.prepare("INSERT INTO family_notes (user_id) VALUES (?)").run(result.lastInsertRowid);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
}

function redirectWithError(res, message) {
  res.redirect(`/?authError=${encodeURIComponent(message)}`);
}

// Maps the handful of expected failure modes to a message a parent would
// actually understand; anything unexpected falls back to a generic retry
// prompt rather than leaking a raw error to the browser.
function socialAuthErrorMessage(err, providerName) {
  if (err.message === "NO_EMAIL") {
    return `Your ${providerName} account didn't share an email address, so we couldn't create an account.`;
  }
  // The provider gave us an email but didn't mark it verified, and it
  // happens to match an existing account — refuse to link (see
  // findOrCreateSocialUser) and surface that clearly instead of the raw
  // UNIQUE constraint error from the insert we then attempted.
  if (typeof err.message === "string" && err.message.includes("UNIQUE constraint failed: users.email")) {
    return "An account with that email already exists. Please log in with your password instead.";
  }
  return `${providerName} sign-in failed. Please try again or use email/password.`;
}

router.get("/auth/google", (req, res) => {
  if (!oauth.isGoogleAvailable) return redirectWithError(res, "Google sign-in isn't set up yet.");
  const state = oauth.randomState();
  setStateCookie(res, state);
  res.redirect(oauth.googleAuthorizeUrl(state));
});

router.get("/auth/google/callback", async (req, res) => {
  const stateOk = stateIsValid(req);
  res.clearCookie(STATE_COOKIE);
  if (!oauth.isGoogleAvailable) return redirectWithError(res, "Google sign-in isn't set up yet.");
  if (req.query.error) return redirectWithError(res, "Google sign-in was cancelled.");
  if (!stateOk || !req.query.code) {
    return redirectWithError(res, "Google sign-in didn't complete. Please try again.");
  }

  try {
    const profile = await oauth.googleExchangeCode(req.query.code);
    const user = findOrCreateSocialUser({
      column: "google_id",
      providerId: profile.providerId,
      email: profile.email,
      emailVerified: profile.emailVerified
    });
    issueSession(res, user.id);
    res.redirect("/");
  } catch (err) {
    console.error("[pwl7] Google sign-in failed:", err);
    redirectWithError(res, socialAuthErrorMessage(err, "Google"));
  }
});

router.get("/auth/facebook", (req, res) => {
  if (!oauth.isFacebookAvailable) return redirectWithError(res, "Facebook sign-in isn't set up yet.");
  const state = oauth.randomState();
  setStateCookie(res, state);
  res.redirect(oauth.facebookAuthorizeUrl(state));
});

router.get("/auth/facebook/callback", async (req, res) => {
  const stateOk = stateIsValid(req);
  res.clearCookie(STATE_COOKIE);
  if (!oauth.isFacebookAvailable) return redirectWithError(res, "Facebook sign-in isn't set up yet.");
  if (req.query.error) return redirectWithError(res, "Facebook sign-in was cancelled.");
  if (!stateOk || !req.query.code) {
    return redirectWithError(res, "Facebook sign-in didn't complete. Please try again.");
  }

  try {
    const profile = await oauth.facebookExchangeCode(req.query.code);
    const user = findOrCreateSocialUser({
      column: "facebook_id",
      providerId: profile.providerId,
      email: profile.email,
      emailVerified: profile.emailVerified
    });
    issueSession(res, user.id);
    res.redirect("/");
  } catch (err) {
    console.error("[pwl7] Facebook sign-in failed:", err);
    redirectWithError(res, socialAuthErrorMessage(err, "Facebook"));
  }
});

module.exports = router;
