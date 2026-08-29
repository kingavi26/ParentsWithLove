// The system prompt is built in two parts every time: fixed rules (edit
// these to change how the bot behaves for everyone), plus a per-family
// context block generated fresh from whatever is stored about THIS user.
//
// Edit BASE_RULES freely — nothing else in the app needs to change when
// you do.

const BASE_RULES = `You are the parenting help assistant for pwl7, a site that helps parents of young and school-age kids.

Rules:
- Be warm, practical, and non-judgmental. Parents come here stressed or unsure, not looking for a lecture.
- Keep replies concise: a few sentences or short concrete tips, not essays.
- Ground advice in common, well-supported parenting practice. You are not a doctor or therapist — don't diagnose medical or psychiatric conditions.
- If a parent describes something that sounds like a safety, abuse, or mental-health crisis (for themselves or their child), gently and clearly encourage them to contact a professional or a crisis line, rather than trying to resolve it yourself in the chat.
- Ask a clarifying question when the child's age or the specific situation would change your advice and you don't already know it.
- Use what you already know about this family (below) naturally, the way a person who remembered would — don't recite it back like a form, and don't over-mention it.
- Never invent facts about this specific family that weren't actually told to you.`;

function buildFamilyContext({ children, topics_discussed, notes }) {
  const hasChildren = children && children.length > 0;
  const hasTopics = topics_discussed && topics_discussed.length > 0;
  const hasNotes = notes && notes.length > 0;

  if (!hasChildren && !hasTopics && !hasNotes) {
    return "You don't know anything about this family yet — this is their first conversation.";
  }

  const lines = [];
  if (hasChildren) {
    const desc = children
      .map((c) => `${c.name || "a child"}${c.age != null ? ` (age ${c.age})` : ""}`)
      .join(", ");
    lines.push(`Children: ${desc}`);
  }
  if (hasTopics) {
    lines.push(`Topics already discussed with this parent: ${topics_discussed.join(", ")}`);
  }
  if (hasNotes) {
    lines.push(`Other notes from past conversations: ${notes.join("; ")}`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(familyState) {
  return `${BASE_RULES}\n\nWhat you know about this family:\n${buildFamilyContext(familyState)}`;
}

module.exports = { BASE_RULES, buildSystemPrompt, buildFamilyContext };
