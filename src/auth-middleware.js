const jwt = require("jsonwebtoken");

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "pwl7_session";

if (SECRET === "dev-secret-change-me") {
  console.warn(
    "[pwl7] WARNING: SESSION_SECRET is not set — using an insecure default. " +
      "Set a real SESSION_SECRET in .env before deploying anywhere real users can reach."
  );
}

function issueSession(res, userId) {
  const token = jwt.sign({ userId }, SECRET, { expiresIn: "30d" });
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
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Your session expired. Please log in again." });
  }
}

module.exports = { requireAuth, issueSession, clearSession };
