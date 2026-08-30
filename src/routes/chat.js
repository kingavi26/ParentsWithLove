const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../auth-middleware");
const { getReply, isDemoMode } = require("../reply-engine");
const { loadFamilyState } = require("../family-state");

const router = express.Router();

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, server time
}

// existingTopics/newTopics: {topic, lastDiscussedAt}[] and string[] respectively.
// Re-mentioning a topic just refreshes its date rather than adding a duplicate.
function mergeTopics(existingTopics, newTopics) {
  const today = todayISO();
  const byTopic = new Map(existingTopics.map((t) => [t.topic, t.lastDiscussedAt]));
  for (const topic of newTopics || []) {
    if (!topic) continue;
    byTopic.set(topic, today);
  }
  const merged = Array.from(byTopic, ([topic, lastDiscussedAt]) => ({ topic, lastDiscussedAt }));
  merged.sort((a, b) => String(b.lastDiscussedAt || "").localeCompare(String(a.lastDiscussedAt || "")));
  return merged.slice(0, 20);
}

// existingNotes: {text, date}[]. New notes are one-off observations, so
// unlike topics they're just appended (deduped by exact text), not refreshed.
function mergeNotes(existingNotes, newNotes) {
  const today = todayISO();
  const seen = new Set(existingNotes.map((n) => n.text));
  const merged = existingNotes.slice();
  for (const text of newNotes || []) {
    if (!text || seen.has(text)) continue;
    seen.add(text);
    merged.push({ text, date: today });
  }
  return merged.slice(-30);
}

function mergeChildren(userId, existingChildren, newChildren) {
  for (const c of newChildren || []) {
    if (!c) continue;
    if (c.name) {
      const existing = db.prepare("SELECT id FROM children WHERE user_id = ? AND name = ?").get(userId, c.name);
      if (existing) {
        if (c.age != null) {
          db.prepare("UPDATE children SET age = ?, updated_at = datetime('now') WHERE id = ?").run(c.age, existing.id);
        }
      } else {
        db.prepare("INSERT INTO children (user_id, name, age) VALUES (?, ?, ?)").run(userId, c.name, c.age ?? null);
      }
    } else if (c.age != null) {
      // No name given — only add if we don't already have an unnamed child at this age,
      // to avoid piling up duplicate rows every time an age gets re-mentioned.
      const existing = db
        .prepare("SELECT id FROM children WHERE user_id = ? AND name IS NULL AND age = ?")
        .get(userId, c.age);
      if (!existing) {
        db.prepare("INSERT INTO children (user_id, name, age) VALUES (?, NULL, ?)").run(userId, c.age);
      }
    }
  }
}

router.post("/chat", requireAuth, async (req, res) => {
  const history = req.body && req.body.history;
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: "Missing conversation history." });
  }
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || !last.content || !last.content.trim()) {
    return res.status(400).json({ error: "The last message must be a non-empty user message." });
  }

  const familyState = loadFamilyState(req.userId);

  let result;
  try {
    result = await getReply({ history, familyState });
  } catch (err) {
    console.error("[pwl7] getReply failed:", err);
    return res.status(502).json({ error: "The assistant is unavailable right now. Please try again in a moment." });
  }

  const extracted = result.extracted || { children: [], topics: [], notes: [] };

  mergeChildren(req.userId, familyState.children, extracted.children);

  const mergedTopics = mergeTopics(familyState.topics_discussed, extracted.topics);
  const mergedNotes = mergeNotes(familyState.notes, extracted.notes);

  db.prepare(
    "UPDATE family_notes SET topics_discussed = ?, notes = ?, last_message_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?"
  ).run(JSON.stringify(mergedTopics), JSON.stringify(mergedNotes), req.userId);

  const updatedChildren = db.prepare("SELECT name, age FROM children WHERE user_id = ? ORDER BY id").all(req.userId);

  res.json({
    reply: result.reply,
    demoMode: isDemoMode,
    remembered: {
      children: updatedChildren,
      topics_discussed: mergedTopics,
      notes: mergedNotes,
      // The timestamp from BEFORE this message (i.e. when the previous
      // conversation left off) — so the UI can say "last time was on X".
      last_conversation_at: familyState.last_conversation_at
    }
  });
});

module.exports = router;
