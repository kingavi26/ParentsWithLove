const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../auth-middleware");
const { reviewSession } = require("../reply-engine");

const router = express.Router();

// Run after a chat session, on demand from the "Rate this session" button.
// Grades the assistant's OWN replies in this conversation against the
// framework + general child development research, and stores the result
// so patterns across many sessions can inform future edits to BASE_RULES.
router.post("/session/review", requireAuth, async (req, res) => {
  const history = req.body && req.body.history;
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: "Nothing to review yet — chat a bit first." });
  }

  let review;
  try {
    review = await reviewSession(history);
  } catch (err) {
    console.error("[pwl7] session review failed:", err);
    return res.status(502).json({ error: "Couldn't generate a review right now. Please try again." });
  }

  if (review.available === false) {
    return res.json(review);
  }

  db.prepare(
    `INSERT INTO session_reviews
      (user_id, overall_score, dimension_scores, strengths, concerns, missed_opportunities, suggested_prompt_changes, message_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.userId,
    review.overallScore ?? null,
    JSON.stringify(review.dimensionScores || {}),
    JSON.stringify(review.strengths || []),
    JSON.stringify(review.concerns || []),
    JSON.stringify(review.missedOpportunities || []),
    JSON.stringify(review.suggestedPromptChanges || []),
    history.length
  );

  res.json(review);
});

// Opt-in view across ALL users' session reviews, for spotting patterns to
// fold back into BASE_RULES. Disabled unless ADMIN_KEY is set in the
// environment; pass it back as the x-admin-key header to use this.
router.get("/admin/reviews", (req, res) => {
  if (!process.env.ADMIN_KEY) return res.status(404).end();
  if (req.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rows = db.prepare("SELECT * FROM session_reviews ORDER BY id DESC LIMIT 200").all();
  const reviews = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    overallScore: r.overall_score,
    dimensionScores: JSON.parse(r.dimension_scores),
    strengths: JSON.parse(r.strengths),
    concerns: JSON.parse(r.concerns),
    missedOpportunities: JSON.parse(r.missed_opportunities),
    suggestedPromptChanges: JSON.parse(r.suggested_prompt_changes),
    messageCount: r.message_count,
    createdAt: r.created_at
  }));
  res.json({ reviews });
});

module.exports = router;
