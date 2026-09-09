const { buildSystemPrompt, getActiveBaseRules } = require("./prompt");
const { mentionsSexualTopic, SEXUAL_TOPIC_REPLY } = require("./sexual-content-guard");

const hasRealKey = Boolean(process.env.OPENAI_API_KEY);

// Lazily require the OpenAI SDK only when a key is present, so DEMO_MODE
// works even if you haven't run `npm install openai` with network access yet.
let client = null;
if (hasRealKey) {
  const OpenAI = require("openai");
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Real chat replies run through a 3-stage pipeline instead of one call:
// Router (classifies the situation + extracts memory facts, as strict
// JSON) -> Generator (writes the actual reply, using the router's
// analysis) -> Validator (judges PASS/FAIL against the framework and the
// router analysis; on FAIL, the generator gets one chance to rewrite).
// All three default to the same model — override per stage below if you
// want a stronger/cheaper model for a specific step.
const PIPELINE_MODEL = process.env.PIPELINE_MODEL || "gpt-5.6-terra";
const ROUTER_MODEL = process.env.ROUTER_MODEL || PIPELINE_MODEL;
const GENERATOR_MODEL = process.env.GENERATOR_MODEL || PIPELINE_MODEL;
const VALIDATOR_MODEL = process.env.VALIDATOR_MODEL || PIPELINE_MODEL;
const MAX_REGENERATIONS = 1;

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
 * Real mode: Router -> Generator -> Validator.
 *
 * The BASE_RULES framework (src/prompt.js) already tells the model to
 * identify known/possible/unknown, classify the situation, choose the
 * right protocol, and self-check. Splitting that into three separate API
 * calls makes those steps structurally hard to skip, instead of relying
 * on one model to reliably do all of it inside a single completion.
 * ------------------------------------------------------------------ */

function formatTranscript(history) {
  return history.map((m) => `${m.role === "user" ? "Parent" : "Assistant"}: ${m.content}`).join("\n");
}

// Strict JSON-schema shape for the router step. Structured Outputs strict
// mode requires every property to be listed in "required" (nullable
// fields use a ["string","null"] type instead of being made optional) and
// every object to set additionalProperties:false.
const ROUTER_SCHEMA = {
  name: "router_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      known_facts: { type: "array", items: { type: "string" } },
      possible_explanations: { type: "array", items: { type: "string" } },
      important_unknowns: { type: "array", items: { type: "string" } },
      child_age_or_stage: { type: ["string", "null"] },
      primary_situation: { type: "string" },
      secondary_situations: { type: "array", items: { type: "string" } },
      requirement_status: {
        type: "string",
        enum: ["optional", "required_eventually_flexible_timing", "required_now"]
      },
      relevant_protocol: { type: "string" },
      developmental_barriers_to_check: { type: "array", items: { type: "string" } },
      must_include_in_answer: { type: "array", items: { type: "string" } },
      must_not_assume: { type: "array", items: { type: "string" } },
      safety_flags: { type: "array", items: { type: "string" } },
      extracted_facts: {
        type: "object",
        additionalProperties: false,
        properties: {
          children: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: ["string", "null"] },
                age: { type: ["number", "null"] }
              },
              required: ["name", "age"]
            }
          },
          topics: { type: "array", items: { type: "string" } },
          notes: { type: "array", items: { type: "string" } }
        },
        required: ["children", "topics", "notes"]
      }
    },
    required: [
      "known_facts",
      "possible_explanations",
      "important_unknowns",
      "child_age_or_stage",
      "primary_situation",
      "secondary_situations",
      "requirement_status",
      "relevant_protocol",
      "developmental_barriers_to_check",
      "must_include_in_answer",
      "must_not_assume",
      "safety_flags",
      "extracted_facts"
    ]
  }
};

const VALIDATOR_SCHEMA = {
  name: "validator_verdict",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["PASS", "FAIL"] },
      failed_rules: { type: "array", items: { type: "string" } },
      brief_reason: { type: "string" }
    },
    required: ["status", "failed_rules", "brief_reason"]
  }
};

// Fact extraction lives here (folded into the router) rather than as its
// own call, so a chat message costs 2-3 OpenAI calls instead of 4-5. The
// trade-off: extraction now only sees the parent's message, not the
// assistant's reply (the router runs before the reply is written) — in
// practice facts about a child almost always come from the parent's own
// words, so this rarely matters.
const ROUTER_SYSTEM_PROMPT = `You are the internal ROUTER for pwl7, a parenting-help assistant. Do NOT answer the parent — you are a silent analysis step that runs before the reply is written.

Analyze the parent's latest message (in light of the conversation so far and what's already known about this family) using child-development principles: attachment theory, authoritative-parenting research, emotion-coaching research, and positive discipline research.

Never invent family rules, motives, diagnoses, feelings, or requirements that weren't actually stated. Distinguish what must happen eventually from what must happen right now. Choose only the protocol(s) actually relevant to this message — most messages need only one.

Return:
- known_facts: only what was explicitly stated
- possible_explanations: plausible (not certain) explanations for the behavior/situation
- important_unknowns: what would help to know but wasn't said
- child_age_or_stage: the child's age or developmental stage if known, else null
- primary_situation: a short label for the main situation (e.g. "unknown_sibling_conflict", "bedtime_stalling", "medicine_refusal")
- secondary_situations: any other situations present in this message, if any (empty array if none)
- requirement_status: "optional" | "required_eventually_flexible_timing" | "required_now"
- relevant_protocol: the specific pwl7 framework step(s)/protocol that apply here
- developmental_barriers_to_check: skills, needs, or developmental limits worth considering (hunger, fatigue, impulse control, language, temperament, sensory needs, etc. — empty array if none stand out)
- must_include_in_answer: AT MOST the 2 most important things the final answer must cover right now, ranked by priority — not a complete list of everything that could be said. The reply this feeds has a hard length limit, so a long checklist here directly causes an overlong, essay-like reply. Anything else worth addressing is a follow-up message's job, not this one's.
- must_not_assume: assumptions the final answer must NOT make (e.g. "equal blame", "older child guilty", a diagnosis, a motive)
- safety_flags: anything indicating danger, self-harm, abuse, or a crisis that needs a professional/crisis-line mention (empty array if none)

You must also extract structured facts to be stored long-term against this family's account, in extracted_facts: {"children":[{"name":string|null,"age":number|null}],"topics":[string],"notes":[string]}. Only include facts newly stated in the parent's latest message that are not already in "Already known". Never guess or invent. If nothing new, return empty arrays for all three.

Privacy rules for extracted_facts — these matter because this is a real, permanent record about a real child:
- For "name", use whatever the parent called the child (nickname, first name, etc.) — never expand or guess a fuller/formal name than what was actually said.
- Never put a school name, address, phone number, or other identifying detail (beyond the child's stated name/nickname and age) into "name", "topics", or "notes".
- Never store a medical or mental-health diagnosis, medication name, or clinical label (e.g. "ADHD", "anxiety disorder", "on Ritalin") verbatim in "notes" or "topics". If the underlying context is useful to remember, generalize it into a plain behavioral/functional description instead (e.g. "sometimes needs extra help with transitions" rather than the diagnosis itself).
- Never create a "notes" entry about self-harm, abuse, or a safety crisis. That kind of disclosure should stay in the live conversation only (surface it via safety_flags instead), not become a permanent record tied to a specific named child.`;

async function routerAnalyze(history, familyState) {
  const lastUserMessage = history[history.length - 1].content;
  const completion = await client.chat.completions.create({
    model: ROUTER_MODEL,
    response_format: { type: "json_schema", json_schema: ROUTER_SCHEMA },
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Already known about this family:\n${JSON.stringify(familyState)}\n\nConversation so far:\n${formatTranscript(history)}\n\nAnalyze the parent's latest message: ${lastUserMessage}`
      }
    ]
  });
  return JSON.parse(completion.choices[0].message.content);
}

async function generateReply(history, familyState, routerResult, failureNote) {
  let systemPrompt = buildSystemPrompt(familyState);

  if (routerResult) {
    const forGenerator = Object.assign({}, routerResult);
    delete forGenerator.extracted_facts;
    systemPrompt +=
      `\n\nINTERNAL ROUTER ANALYSIS FOR THIS MESSAGE (already determined — do not ignore it, do not repeat it back to the parent, and never mention that a "router" or analysis step exists):\n${JSON.stringify(forGenerator, null, 2)}\n\n` +
      `Use this analysis to write the reply: cover must_include_in_answer, honor must_not_assume, and follow relevant_protocol using the framework above. Use only whichever parts of the framework are relevant to this specific situation. Write in natural wording an ordinary parent can actually use — do not sound clinical, do not add assumptions the analysis doesn't support, and give concrete next steps.\n\n` +
      `The analysis above is internal guidance, not an outline to reproduce. must_include_in_answer having multiple items is NOT a reason to write a longer reply — cover the single most important item well; touch the second only if it fits naturally in one added sentence.\n\n` +
      `HARD LENGTH LIMIT: the entire reply must be under 80 words — roughly 3-5 sentences. This is not a soft target, it's a ceiling: count as you write, and cut before you exceed it. One short paragraph, optionally plus one quoted example line a parent could say, is the whole reply — never multiple paragraphs, never a paragraph-per-topic structure, no headers, no numbered or bulleted lists. If the real situation needs more than one message's worth of guidance, say the most important thing now and let the parent's next message pull the rest out of you — do not front-load it all into one long reply.`;
  }

  if (failureNote) {
    systemPrompt += `\n\nThe previous answer failed an internal quality check.\n${failureNote}\nRewrite the answer to correct these specific failures while preserving everything that was already good. Never mention validation, a rewrite, or this process to the parent.`;
  }

  const completion = await client.chat.completions.create({
    model: GENERATOR_MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...history]
  });
  return completion.choices[0].message.content.trim();
}

function buildValidatorSystemPrompt(routerResult) {
  return `You are the pwl7 QUALITY VALIDATOR. You are not the response writer — you judge PASS or FAIL only, and say why.

Compare the parent's original message, the router analysis, and the proposed answer against the pwl7 master framework below, and decide whether the proposed answer correctly executes the relevant protocol.

PWL7 MASTER FRAMEWORK:
"""
${getActiveBaseRules()}
"""

ROUTER ANALYSIS FOR THIS MESSAGE:
${JSON.stringify(routerResult, null, 2)}

Check these two FIRST, and FAIL on either regardless of how good the content is — a reply can be substantively excellent and still fail on length or format:
- LENGTH: is the whole reply under roughly 80 words (about 3-5 sentences, one short paragraph plus at most one quoted example line)? A reply of multiple paragraphs, or one long paragraph covering several separate points, FAILS this even if every sentence in it is well-written and correct. pwl7 replies say the single most important thing now, not everything that could eventually be said.
- FORMAT: no markdown headers (### ...), no numbered procedure, no bullet lists, no named sections. A caring friend's text message, not a handout.

Then check substance — but weigh these against the length limit above: a good reply picks ONE clear next step and executes it well, rather than trying to complete an entire multi-step protocol in one message. Do not FAIL a short reply merely for not covering every sub-step of a protocol in a single message — that's what follow-up messages are for.
- Did it separate facts from possibilities, where relevant to what it actually said?
- Did it avoid inventing motives, feelings, diagnoses, family rules, or requirements?
- Did the child's age/stage actually affect the advice?
- Did it preserve appropriate autonomy?
- Did it maintain genuinely necessary responsibilities/boundaries?
- Was the step it chose to take actually the right first/next step for this situation and protocol (not necessarily the whole protocol)?
- Did it avoid shame and unnecessary control?
- Did it avoid unsupported research claims (e.g. "this will cause...")?
- Did it preserve love, dignity, and connection?
- Did it address must_include_in_answer's top priority item and avoid must_not_assume from the router analysis, without turning the checklist into an outline the parent can see?
- If relevant_protocol involves sibling conflict and the parent doesn't yet know what happened: did the reply's chosen step move toward hearing both sides / establishing facts, rather than jumping straight to a parent-imposed solution or assigning blame? (Hearing both children and building a child-generated solution can validly happen across this and later messages, not all in one.)
- If safety_flags is non-empty: did the answer appropriately encourage contacting a professional or crisis resource rather than trying to resolve it alone?

Return "FAIL" when the answer fails the LENGTH or FORMAT check, clearly fails to execute the relevant protocol's right-now step, or violates the framework in a way that matters for this family. Do not FAIL for genuinely minor word-choice preferences, and do not FAIL a short, well-chosen single step just because it doesn't also finish the whole protocol.`;
}

async function validateReply(history, routerResult, proposedReply) {
  const lastUserMessage = history[history.length - 1].content;
  const completion = await client.chat.completions.create({
    model: VALIDATOR_MODEL,
    response_format: { type: "json_schema", json_schema: VALIDATOR_SCHEMA },
    messages: [
      { role: "system", content: buildValidatorSystemPrompt(routerResult) },
      { role: "user", content: `Parent's original message:\n${lastUserMessage}\n\nProposed answer:\n${proposedReply}` }
    ]
  });
  return JSON.parse(completion.choices[0].message.content);
}

async function realReply(history, familyState) {
  let routerResult = null;
  try {
    routerResult = await routerAnalyze(history, familyState);
  } catch (err) {
    // If the router breaks, fall back to a direct reply with no
    // validation pass — exactly the old single-call behavior — rather
    // than blocking the parent on an internal step that failed. No facts
    // get extracted this turn (extraction now lives inside the router).
    console.error("[pwl7] router analysis failed, falling back to a direct reply:", err.message);
    const reply = await generateReply(history, familyState, null, null);
    return { reply, extracted: { children: [], topics: [], notes: [] } };
  }

  let reply = await generateReply(history, familyState, routerResult, null);

  // Validates the current reply; on FAIL, regenerates and validates again
  // (up to MAX_REGENERATIONS times) — a rewrite is re-checked, not just
  // trusted blind. Whatever reply is standing after the last allowed
  // attempt is shown to the parent regardless of that last verdict, so a
  // stubborn FAIL can never turn into an infinite loop or a blocked reply.
  for (let attempt = 0; attempt <= MAX_REGENERATIONS; attempt++) {
    let verdict;
    try {
      verdict = await validateReply(history, routerResult, reply);
    } catch (err) {
      // Validation is a quality gate, not something that should ever
      // block the reply the parent is waiting on.
      console.error("[pwl7] validator failed, showing the answer as-is:", err.message);
      break;
    }
    if (verdict.status !== "FAIL") break;

    if (attempt === MAX_REGENERATIONS) {
      console.warn(
        "[pwl7] validator still FAILed after the max regenerations, showing the last answer anyway:",
        verdict.failed_rules,
        verdict.brief_reason
      );
      break;
    }

    console.warn("[pwl7] validator FAILed a reply, regenerating:", verdict.failed_rules, verdict.brief_reason);
    const failureNote = `Failures:\n${(verdict.failed_rules || []).map((f) => `- ${f}`).join("\n")}${
      verdict.brief_reason ? `\nReason: ${verdict.brief_reason}` : ""
    }`;
    reply = await generateReply(history, familyState, routerResult, failureNote);
  }

  const extracted = routerResult.extracted_facts || { children: [], topics: [], notes: [] };
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
${getActiveBaseRules()}
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

/* ------------------------------------------------------------------ *
 * Learned-patterns drafting: runs right after a session review, and
 * ONLY ever proposes changes to the "Learned patterns" appendix (see
 * src/prompt.js) — never the hand-written core framework above it. The
 * result is a draft that sits in base_rules_pending_update until an
 * admin approves or rejects it (src/routes/admin.js); nothing here ever
 * touches the live prompt directly.
 * ------------------------------------------------------------------ */

const LEARNED_PATTERNS_DRAFT_MODEL = process.env.LEARNED_PATTERNS_DRAFT_MODEL || REVIEW_MODEL;

const LEARNED_PATTERNS_SCHEMA = {
  name: "learned_patterns_update",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      meaningful_change: { type: "boolean" },
      updated_learned_patterns: { type: "string" },
      change_summary: { type: "string" }
    },
    required: ["meaningful_change", "updated_learned_patterns", "change_summary"]
  }
};

// coreBaseRules/existingLearnedPatterns come from src/prompt.js
// (getCoreBaseRules/getLearnedPatternsText); review is whatever
// reviewSession() just returned for this conversation.
async function draftLearnedPatternsUpdate({ coreBaseRules, existingLearnedPatterns, review }) {
  if (!client) {
    return { meaningfulChange: false, updatedLearnedPatterns: existingLearnedPatterns || "", changeSummary: "" };
  }

  const systemPrompt = `You maintain a "Learned patterns" appendix to pwl7's parenting-assistant framework. This appendix is the ONLY part of the framework that gets updated from session self-reviews — you must never contradict, duplicate, restate, or rewrite the core framework below; treat it as fixed, read-only context.

CORE FRAMEWORK (read-only — do not reproduce or edit):
"""
${coreBaseRules}
"""

CURRENT LEARNED PATTERNS APPENDIX (may be empty if none exist yet):
"""
${existingLearnedPatterns || "(empty — no learned patterns yet)"}
"""

A new session self-review just flagged possible improvements (below). You are NOT the final gatekeeper here — every draft you produce sits in a single pending slot until a human admin approves or rejects it from a dashboard (with a full current-vs-proposed diff), so the right default is to draft readily and let the admin curate, rather than pre-filtering so hard that the admin rarely sees anything.

Concretely: if "Suggested prompt changes" below contains ANY concrete, actionable item, default to turning it into a short appendix instruction (meaningful_change: true) even if you're not fully certain it generalizes to every family — that judgment call belongs to the admin's approve/reject, not to you. Only return meaningful_change: false when there is no concrete suggested prompt change to work from AND what remains (concerns/missed opportunities) is either already fully covered by the core framework or an existing appendix bullet, or is so specific to this one family/conversation that no reasonable instruction could be phrased from it.

If you do add or adjust something: phrase it as a short, concrete instruction in the same style as the existing bullets, don't duplicate anything already covered by the core framework or an existing bullet (tighten or merge instead of restating), and keep the whole appendix tight (merge or tighten related bullets rather than letting it grow forever). These next two rules are non-negotiable no matter how permissive the guidance above is: never reproduce, rewrite, contradict, or otherwise touch the core framework's own text — it is fixed, read-only context — and never add, adjust, or imply anything that could weaken the core framework's safety-flag / crisis-referral guidance.

Session review to consider:
Overall score: ${review.overallScore != null ? review.overallScore : "n/a"}/10
Concerns: ${JSON.stringify(review.concerns || [])}
Missed opportunities: ${JSON.stringify(review.missedOpportunities || [])}
Suggested prompt changes: ${JSON.stringify(review.suggestedPromptChanges || [])}

Return meaningful_change: false, and echo the current appendix back unchanged in updated_learned_patterns, only in the narrow no-concrete-suggestion case described above. change_summary should be one short sentence describing what changed (or why nothing did).`;

  const completion = await client.chat.completions.create({
    model: LEARNED_PATTERNS_DRAFT_MODEL,
    response_format: { type: "json_schema", json_schema: LEARNED_PATTERNS_SCHEMA },
    messages: [{ role: "system", content: systemPrompt }]
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    meaningfulChange: Boolean(parsed.meaningful_change),
    updatedLearnedPatterns: parsed.updated_learned_patterns || existingLearnedPatterns || "",
    changeSummary: parsed.change_summary || ""
  };
}

/**
 * @param {Array<{role: 'user'|'assistant', content: string}>} history - this browser session's conversation so far (oldest first)
 * @param {{children: Array<{name:string|null, age:number|null}>, topics_discussed: string[], notes: string[]}} familyState - everything stored about this user
 * @returns {Promise<{reply: string, extracted: {children: Array, topics: string[], notes: string[]}}>}
 */
async function getReply({ history, familyState }) {
  const lastUserMessage = history[history.length - 1].content;

  // Deterministic backstop, checked first — before demo mode, before the
  // router, before any OpenAI call — so this never depends on a model
  // call succeeding or judging correctly. See sexual-content-guard.js.
  // Nothing gets extracted/stored for a message that trips this.
  if (mentionsSexualTopic(lastUserMessage)) {
    return { reply: SEXUAL_TOPIC_REPLY, extracted: { children: [], topics: [], notes: [] } };
  }

  if (client) {
    return realReply(history, familyState);
  }

  const { reply, matchedTopic } = demoReply(lastUserMessage);
  const extracted = demoExtractFacts(lastUserMessage, matchedTopic);
  return { reply, extracted };
}

module.exports = { getReply, reviewSession, draftLearnedPatternsUpdate, isDemoMode: !hasRealKey };
