const { db } = require("./db");

// Topics/notes used to be stored as flat arrays of plain strings. They're
// now timestamped objects so the assistant (and the "What we remember"
// sidebar) can say *when* something was discussed, not just that it was.
// These normalizers make both shapes safe to read, so rows written before
// this change keep working (just without a date) instead of crashing.
function normalizeTopics(raw) {
  return (raw || []).map((t) => (typeof t === "string" ? { topic: t, lastDiscussedAt: null } : t));
}

function normalizeNotes(raw) {
  return (raw || []).map((n) => (typeof n === "string" ? { text: n, date: null } : n));
}

// Everything remembered about one family, plus when we last talked to them
// at all (family_notes.last_message_at — null until their first real chat
// message, distinct from the row being created at signup).
function loadFamilyState(userId) {
  const children = db.prepare("SELECT id, name, age FROM children WHERE user_id = ? ORDER BY id").all(userId);
  const notesRow = db
    .prepare("SELECT topics_discussed, notes, last_message_at FROM family_notes WHERE user_id = ?")
    .get(userId);

  return {
    children,
    topics_discussed: notesRow ? normalizeTopics(JSON.parse(notesRow.topics_discussed)) : [],
    notes: notesRow ? normalizeNotes(JSON.parse(notesRow.notes)) : [],
    last_conversation_at: notesRow ? notesRow.last_message_at : null
  };
}

module.exports = { loadFamilyState, normalizeTopics, normalizeNotes };
