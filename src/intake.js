// Canonical list of concern options offered by the new-parent intake wizard
// (public/app.js builds its chips from this same wording; POST /api/intake,
// src/routes/intake.js, validates against it). One shared list rather than
// hand-keeping the same strings in two places — the exact text a parent
// picks is also what gets stored as a remembered topic (family_notes,
// same shape chat-based fact extraction already writes), so the UI label
// and the stored fact are always identical by construction.
//
// Deliberately worded the way a parent would say it, not a clinical/admin
// term, and chosen to line up 1:1 with the router's existing situation
// categories (see src/reply-engine.js) and the research-source keyword
// buckets (src/research-sources.js) — a pick here is immediately useful
// context for both, not a new taxonomy those systems have to learn.
const INTAKE_CONCERNS = [
  "Bedtime & sleep",
  "Tantrums & big emotions",
  "Sibling conflict",
  "Screen time & tech",
  "Listening & cooperation",
  "Discipline & setting boundaries",
  "School, homework, or focus",
  "Friendships & social stuff",
  "Separation anxiety / clinginess",
  "Mealtime battles",
  "Potty training",
  "A big change lately",
  "Talking about feelings"
];

module.exports = { INTAKE_CONCERNS };
