// A tiny, dependency-free in-memory rate limiter. Good enough for this
// app's scale (a single Render instance, no horizontal scaling) and avoids
// adding a new npm dependency just for this. If this service is ever run
// across multiple instances, swap the in-memory Map below for something
// shared (e.g. Redis) — the rateLimit() function signature can stay the same.
//
// Why this exists: parent and admin accounts hold real facts about real
// children, so brute-force/credential-stuffing protection on login is a
// privacy control, not just an availability one.

const buckets = new Map(); // key -> { count, resetAt }

let nextLimiterId = 0;

/**
 * @param {object} opts
 * @param {number} opts.windowMs - how long a bucket lasts before resetting
 * @param {number} opts.max - max requests allowed per window per key
 * @param {(req: import('express').Request) => string} opts.keyFn - how to bucket requests (e.g. by IP, or IP+email)
 * @param {string} [opts.message]
 */
function rateLimit({ windowMs, max, keyFn, message }) {
  // Every call to rateLimit() gets its own namespace prefix, so two
  // different limiters that both key on plain IP (e.g. login vs. admin
  // login) never collide into the same bucket just because req.ip matches —
  // each route's attempt count is tracked independently.
  const namespace = `limiter${nextLimiterId++}:`;

  return function (req, res, next) {
    let key;
    try {
      key = namespace + keyFn(req);
    } catch (err) {
      key = namespace + (req.ip || "unknown");
    }

    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: message || "Too many attempts. Please wait a bit and try again."
      });
    }

    next();
  };
}

// Periodic cleanup so long-lived server processes don't accumulate stale
// buckets forever. unref() so this timer never keeps the process alive on
// its own (matters for tests/scripts that start the server and exit).
const cleanupTimer = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  },
  10 * 60 * 1000
);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

function byIp(req) {
  return req.ip || "unknown";
}

function byIpAndEmail(req) {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  return `${req.ip || "unknown"}:${email || "no-email"}`;
}

module.exports = { rateLimit, byIp, byIpAndEmail };
