const jwt = require("jsonwebtoken");

// Deliberately a completely separate credential and cookie from the
// parent-facing login (src/auth-middleware.js): ADMIN_EMAIL/ADMIN_PASSWORD
// are their own env vars, not tied to any row in the users table, so being
// an admin never depends on also having (or not having) a regular parent
// account. Same convention as the app's other opt-in secrets (OPENAI_API_KEY,
// FACEBOOK_APP_SECRET, etc.) — set directly as a Render env var, not hashed
// at rest, since it's a single shared secret rather than many users' own
// passwords. The admin dashboard simply doesn't exist (404s) until both are set.
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "pwl7_admin_session";

const isAdminAvailable = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function checkAdminCredentials(email, password) {
  if (!isAdminAvailable) return false;
  return (
    normalizeEmail(email) === normalizeEmail(process.env.ADMIN_EMAIL) &&
    String(password || "") === process.env.ADMIN_PASSWORD
  );
}

// Shorter-lived than a parent session (12h vs 30d) since this cookie
// unlocks account management and prompt editing — a more sensitive
// surface worth re-authenticating into more often.
function issueAdminSession(res) {
  const token = jwt.sign({ admin: true }, SECRET, { expiresIn: "12h" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000
  });
}

function clearAdminSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function hasValidAdminSession(req) {
  if (!isAdminAvailable) return false;
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, SECRET);
    return Boolean(payload.admin);
  } catch (err) {
    return false;
  }
}

function requireAdminAuth(req, res, next) {
  if (!isAdminAvailable) return res.status(404).end();
  if (!hasValidAdminSession(req)) {
    return res.status(401).json({ error: "Not logged in as admin." });
  }
  next();
}

module.exports = {
  isAdminAvailable,
  checkAdminCredentials,
  issueAdminSession,
  clearAdminSession,
  hasValidAdminSession,
  requireAdminAuth
};
