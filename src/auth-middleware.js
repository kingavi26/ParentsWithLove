const jwt = require("jsonwebtoken");
const { db } = require("./db");

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "pwl7_session";

if (SECRET === "dev-secret-change-me") {
  console.warn(
    "[pwl7] WARNING: SESSION_SECRET is not set — using an insecure default. " +
      "Set a real SESSION_SECRET in .env before deploying anywhere real users can reach."
  );
}

function issueSession(res, userId, tokenVersion) {
  const token = jwt.sign({ userId, tv: tokenVersion || 0 }, SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not logged in." });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Your session expired. Please log in again." });
  }

  // A DB lookup on every authenticated request (cheap — SQLite, indexed
  // primary key) rather than trusting the JWT alone, so an admin
  // suspending or deleting an account takes effect immediately instead of
  // waiting up to 30 days for that account's existing session to expire.
  const user = db.prepare("SELECT id, suspended, token_version FROM users WHERE id = ?").get(payload.userId);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Account no longer exists." });
  }
  if (user.suspended) {
    clearSession(res);
    return res.status(403).json({ error: "This account has been suspended." });
  }
  // A token signed before a later password change carries the token
  // version that was current when it was issued (older tokens with no "tv"
  // at all are treated as version 0, so this migration doesn't log anyone
  // out by itself). Once account.js bumps token_version on a password
  // change, every other outstanding token stops matching here — the same
  // "logged in elsewhere" cookie can no longer be replayed.
  if ((payload.tv || 0) !== (user.token_version || 0)) {
    clearSession(res);
    return res.status(401).json({ error: "Your session is no longer valid. Please log in again." });
  }

  req.userId = payload.userId;
  next();
}

module.exports = { requireAuth, issueSession, clearSession };
