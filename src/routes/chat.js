const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../auth-middleware");
const { getReply, isDemoMode } = require("../reply-engine");

const router = express.Router();

function loadFamilyState(userId) {
  const children = db.prepare("SELECT name, age FROM children WHERE user_id = ? ORDER BY id").all(userId);
  const notesRow = db.prepare("SELECT topics_discussed, notes FROM family_notes WHERE user_id = ?").get(userId);
  return {
    children,
    topics_discussed: notesRow ? JSON.parse(notesRow.topics_discussed) : [],
    notes: notesRow ? JSON.parse(notesRow.notes) : []
  };
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

  const mergedTopics = Array.from(new Set([...(familyState.topics_discussed || []), ...(extracted.topics || [])])).slice(-20);
  const mergedNotes = Array.from(new Set([...(familyState.notes || []), ...(extracted.notes || [])])).slice(-30);

  db.prepare(
    "UPDATE family_notes SET topics_discussed = ?, notes = ?, updated_at = datetime('now') WHERE user_id = ?"
  ).run(JSON.stringify(mergedTopics), JSON.stringify(mergedNotes), req.userId);

  const updatedChildren = db.prepare("SELECT name, age FROM children WHERE user_id = ? ORDER BY id").all(req.userId);

  res.json({
    reply: result.reply,
    demoMode: isDemoMode,
    remembered: {
      children: updatedChildren,
      topics_discussed: mergedTopics,
      notes: mergedNotes
    }
  });
});

module.exports = router;
