const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../auth-middleware");
const { reviewSession, draftLearnedPatternsUpdate } = require("../reply-engine");
const { getCoreBaseRules, getLearnedPatternsText, savePendingLearnedPatternsUpdate } = require("../prompt");
const { rateLimit, byUserId } = require("../rate-limit");

const router = express.Router();

// This is a "rate this session" button a parent clicks occasionally, not
// something a normal flow calls repeatedly — 10/hour per account is plenty
// of headroom for real use while capping the cost of someone mashing it.
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyFn: byUserId,
  message: "You've requested a lot of session reviews recently. Please wait a bit and try again."
});

// Run after a chat session, on demand from the "Rate this session" button.
// Grades the assistant's OWN replies in this conversation against the
// framework + general child development research, and stores the result
// so patterns across many sessions can inform future edits to BASE_RULES.
router.post("/session/review", requireAuth, reviewLimiter, async (req, res) => {
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

  const insertResult = db.prepare(
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

  // Best-effort: draft an update to the BASE_RULES "Learned patterns"
  // appendix from this review, for an admin to approve or reject later
  // (see src/prompt.js and the admin dashboard's Prompt tab). This never
  // touches the live prompt itself and must never fail or slow down the
  // review a parent is waiting on.
  const hasSomethingToConsider =
    (review.suggestedPromptChanges && review.suggestedPromptChanges.length) ||
    (review.concerns && review.concerns.length) ||
    (review.missedOpportunities && review.missedOpportunities.length);

  if (hasSomethingToConsider) {
    try {
      const draft = await draftLearnedPatternsUpdate({
        coreBaseRules: getCoreBaseRules(),
        existingLearnedPatterns: getLearnedPatternsText(),
        review
      });
      if (draft.meaningfulChange) {
        savePendingLearnedPatternsUpdate(draft.updatedLearnedPatterns, draft.changeSummary, insertResult.lastInsertRowid);
      }
    } catch (err) {
      console.error("[pwl7] learned-patterns draft failed (review itself still succeeded):", err.message);
    }
  }

  res.json(review);
});

// The old ADMIN_KEY-gated GET /admin/reviews used to live here. It's been
// replaced by src/routes/admin.js's GET /api/admin/reviews, which sits
// behind real admin login (see src/admin-auth.js) instead of a shared
// secret in a URL/header. The ADMIN_KEY env var is no longer read anywhere.

module.exports = router;
