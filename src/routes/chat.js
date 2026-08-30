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

// A parent's name and age for the same child often arrive in *different*
// messages ("he's 7 and having a rough week" today, "Kai loved the park"
// next week) or even split within one extraction ("my son Kai is 7" can
// come back from demoExtractFacts as two separate facts). Without help,
// each half creates its own row and the name-less one shows up in the UI
// forever as "Unnamed child". So before creating a brand-new row, this
// looks for a single existing partial record the new fact could complete
// — an unnamed row at the stated age, or the one unnamed/ageless row on
// file when the new fact has no matching field of its own to key off of.
// It only auto-attaches when exactly one such candidate exists; with two
// or more (e.g. twins, or several kids with no name yet) it's genuinely
// ambiguous, so it plays it safe and inserts a new row instead of guessing.
function mergeChildren(userId, existingChildren, newChildren) {
  for (const c of newChildren || []) {
    if (!c) continue;
    const hasAge = c.age != null;

    if (c.name) {
      const existingByName = db.prepare("SELECT id FROM children WHERE user_id = ? AND name = ?").get(userId, c.name);
      if (existingByName) {
        if (hasAge) {
          db.prepare("UPDATE children SET age = ?, updated_at = datetime('now') WHERE id = ?").run(c.age, existingByName.id);
        }
        continue;
      }

      let candidate = null;
      if (hasAge) {
        const matches = db
          .prepare("SELECT id FROM children WHERE user_id = ? AND name IS NULL AND age = ?")
          .all(userId, c.age);
        if (matches.length === 1) candidate = matches[0];
      } else {
        const nameless = db.prepare("SELECT id FROM children WHERE user_id = ? AND name IS NULL").all(userId);
        if (nameless.length === 1) candidate = nameless[0];
      }

      if (candidate) {
        db.prepare("UPDATE children SET name = ?, updated_at = datetime('now') WHERE id = ?").run(c.name, candidate.id);
      } else {
        db.prepare("INSERT INTO children (user_id, name, age) VALUES (?, ?, ?)").run(userId, c.name, c.age ?? null);
      }
    } else if (hasAge) {
      // No name given — only add if we don't already have an unnamed child at this age,
      // to avoid piling up duplicate rows every time an age gets re-mentioned.
      const existingNameless = db
        .prepare("SELECT id FROM children WHERE user_id = ? AND name IS NULL AND age = ?")
        .get(userId, c.age);
      if (existingNameless) continue;

      // Otherwise, does this age belong to a child we already know by name
      // but never got an age for yet?
      const agelessNamed = db
        .prepare("SELECT id FROM children WHERE user_id = ? AND name IS NOT NULL AND age IS NULL")
        .all(userId);
      if (agelessNamed.length === 1) {
        db.prepare("UPDATE children SET age = ?, updated_at = datetime('now') WHERE id = ?").run(c.age, agelessNamed[0].id);
      } else {
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

  const updatedChildren = db.prepare("SELECT id, name, age FROM children WHERE user_id = ? ORDER BY id").all(req.userId);

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
