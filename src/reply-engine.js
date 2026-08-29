const { buildSystemPrompt, BASE_RULES } = require("./prompt");

const hasRealKey = Boolean(process.env.OPENAI_API_KEY);

// Lazily require the OpenAI SDK only when a key is present, so DEMO_MODE
// works even if you haven't run `npm install openai` with network access yet.
let client = null;
if (hasRealKey) {
  const OpenAI = require("openai");
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* ------------------------------------------------------------------ *
 * DEMO_MODE: scripted replies + regex-based fact-spotting.
 * Used automatically whenever OPENAI_API_KEY is not set, so you can
 * build and test login + the personalization flow before paying for
 * real API calls. None of this runs once a real key is configured.
 * ------------------------------------------------------------------ */

const DEMO_TOPICS = {
  tantrums: {
    match: /(tantrum|meltdown|scream|cry|big feeling)/i,
    label: "big feelings & tantrums",
    reply:
      "Tantrums are usually a sign of overwhelm, not defiance. Naming the feeling out loud before problem-solving, and staying calm yourself, helps most kids come down faster."
  },
  screens: {
    match: /(screen|ipad|tablet|phone|tv|video game)/i,
    label: "screen time",
    reply:
      "A 5-minute warning plus a consistent 'next thing' to move to (not just 'no more iPad') usually makes stopping screens much smoother than an abrupt cutoff."
  },
  bedtime: {
    match: /(bed|sleep|night|nap)/i,
    label: "bedtime",
    reply:
      "Bedtime stalling responds well to a short, identical routine every night — predictability lowers the anxiety that drives the stalling."
  },
  siblings: {
    match: /(sibling|brother|sister|fight|hit)/i,
    label: "sibling conflict",
    reply:
      "In the moment, narrating instead of judging (\"I see two kids who both want the same toy\") keeps both kids on your side better than assigning blame."
  }
};

function demoReply(message) {
  for (const topic of Object.values(DEMO_TOPICS)) {
    if (topic.match.test(message)) {
      return { reply: topic.reply, matchedTopic: topic.label };
    }
  }
  return {
    reply:
      "I don't have a scripted answer for that yet — once this is connected to a real AI backend it'll handle open questions like that. Try asking about tantrums, screen time, bedtime, or sibling conflict.",
    matchedTopic: null
  };
}

// Very rough heuristics — good enough to demo the memory flow, not a
// real NLP pipeline. Real extraction (see below) replaces this once a
// real API key is set.
function demoExtractFacts(message, matchedTopic) {
  const facts = { children: [], topics: [], notes: [] };

  const ageRegex = /\b(son|daughter|kid|child|he|she)\b[^.?!]{0,25}?\b(\d{1,2})\b\s*(years?\s*old|yo)?/i;
  const ageMatch = message.match(ageRegex);
  if (ageMatch) {
    const age = parseInt(ageMatch[2], 10);
    if (age > 0 && age < 18) {
      facts.children.push({ name: null, age });
      facts.notes.push(`Mentioned a child around age ${age}`);
    }
  }

  const nameMatch = message.match(/\bmy (?:son|daughter|kid)(?:'s name is| is called| named)?\s+([A-Z][a-z]+)/);
  if (nameMatch) {
    facts.children.push({ name: nameMatch[1], age: null });
  }

  if (matchedTopic) facts.topics.push(matchedTopic);

  return facts;
}

/* ------------------------------------------------------------------ *
 * Real mode: OpenAI-backed reply + a second small call to extract
 * structured facts from the exchange.
 * ------------------------------------------------------------------ */

async function realReply(history, familyState) {
  const systemPrompt = buildSystemPrompt(familyState);

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...history]
  });
  const reply = completion.choices[0].message.content.trim();

  const lastUserMessage = history[history.length - 1].content;

  let extracted = { children: [], topics: [], notes: [] };
  try {
    const extraction = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You extract structured facts from one exchange in a parenting chat. Return ONLY JSON of the shape {"children":[{"name":string|null,"age":number|null}],"topics":[string],"notes":[string]}. Only include facts newly stated in THIS exchange that are not already in "Already known". Never guess or invent. If nothing new, return empty arrays for all three fields.'
        },
        {
          role: "user",
          content: `Already known:\n${JSON.stringify(familyState)}\n\nNew exchange:\nParent: ${lastUserMessage}\nAssistant: ${reply}`
        }
      ]
    });
    extracted = JSON.parse(extraction.choices[0].message.content);
  } catch (err) {
    // Fact extraction is a nice-to-have, not something that should ever
    // break the chat itself if it fails or returns malformed JSON.
    console.error("[pwl7] fact extraction failed, continuing without it:", err.message);
  }

  return { reply, extracted };
}

/* ------------------------------------------------------------------ *
 * Session self-review: after a conversation, the assistant grades its
 * OWN replies against both the pwl7 framework (BASE_RULES) and general
 * child development research — not just "did it follow the rules" but
 * "would a developmental psychologist actually agree with this advice."
 * Stored in session_reviews (see src/db.js) so patterns across many
 * reviews can be folded back into BASE_RULES over time.
 * ------------------------------------------------------------------ */

const REVIEW_MODEL = process.env.REVIEW_MODEL || MODEL;

async function reviewSession(history) {
  if (!client) {
    return {
      available: false,
      message:
        "Session self-review needs a real OpenAI connection — this app is currently running in demo mode."
    };
  }

  const transcript = history
    .map((m) => `${m.role === "user" ? "Parent" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const reviewerSystemPrompt = `You are an independent reviewer with deep expertise in child development research — developmental psychology, attachment theory, authoritative-parenting research (e.g. Baumrind), emotion-coaching research (e.g. Gottman), and positive discipline research. You are auditing an AI parenting assistant's OWN replies in the transcript below.

The assistant is supposed to follow this framework:
"""
${BASE_RULES}
"""

Judge the assistant's actual replies against BOTH (a) whether it followed its own framework, and (b) whether that framework's guidance, as applied here, actually matches what solid child development research would support. Push back if the research would qualify, refine, or disagree with something the assistant said or the framework itself — don't just check boxes.

Be concrete and specific to what was actually said in THIS transcript, not generic parenting advice. If the assistant did well, say exactly what it did right. If not, say exactly what a stronger, research-grounded reply would have included instead.

Return ONLY strict JSON of this shape:
{
  "overallScore": number (1-10),
  "dimensionScores": {
    "loveAndSafety": number (1-10),
    "understandingBeforeGuiding": number (1-10),
    "regulationTiming": number (1-10),
    "validation": number (1-10),
    "boundaryWarmth": number (1-10),
    "developmentalAppropriateness": number (1-10),
    "researchGrounding": number (1-10)
  },
  "strengths": [string, ...],
  "concerns": [string, ...],
  "missedOpportunities": [string, ...],
  "suggestedPromptChanges": [string, ...]
}
Each array should have 0-4 short, specific items (empty array if genuinely none). "suggestedPromptChanges" should be concrete edits to the assistant's system prompt/framework, phrased as instructions (e.g. "Add a rule that..."), only when a change is actually warranted by this transcript.`;

  const completion = await client.chat.completions.create({
    model: REVIEW_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: reviewerSystemPrompt },
      { role: "user", content: `Transcript to review:\n\n${transcript}` }
    ]
  });

  const review = JSON.parse(completion.choices[0].message.content);
  return Object.assign({ available: true }, review);
}

/**
 * @param {Array<{role: 'user'|'assistant', content: string}>} history - this browser session's conversation so far (oldest first)
 * @param {{children: Array<{name:string|null, age:number|null}>, topics_discussed: string[], notes: string[]}} familyState - everything stored about this user
 * @returns {Promise<{reply: string, extracted: {children: Array, topics: string[], notes: string[]}}>}
 */
async function getReply({ history, familyState }) {
  if (client) {
    return realReply(history, familyState);
  }

  const lastUserMessage = history[history.length - 1].content;
  const { reply, matchedTopic } = demoReply(lastUserMessage);
  const extracted = demoExtractFacts(lastUserMessage, matchedTopic);
  return { reply, extracted };
}

module.exports = { getReply, reviewSession, isDemoMode: !hasRealKey };
