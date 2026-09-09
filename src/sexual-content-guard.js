// pwl7 does not provide guidance on sexual matters of any kind — a child's
// sexual development or education (puberty, "the talk"), sexual behavior,
// or sexual abuse/grooming concerns. That's a deliberate scope decision
// (see the matching BASE_RULES paragraph in prompt.js for the model-level
// version of this rule), and this module is the DETERMINISTIC backstop: a
// lightweight keyword check that runs before any OpenAI call, so the app
// never depends solely on a language model's in-the-moment judgment to
// catch this category. If it matches, the parent gets a short, warm
// redirect to a human professional instead of a generated reply, and
// nothing about the message is extracted or stored (see reply-engine.js).
//
// Trade-off, by design: this is a hard, whole-message short-circuit. If a
// message mixes a triggering phrase with an unrelated question, the whole
// reply becomes the redirect rather than answering the other part — the
// BASE_RULES prompt-level rule is the one that can make that nuance call
// for phrasings this list doesn't catch; this layer favors never missing
// one over never over-triggering.
//
// Deliberately NOT included here — these are ordinary, in-scope parenting
// topics, not "sexual matters": breastfeeding/nursing, potty training,
// toddler nudity or body-awareness in the non-sexual sense, and general
// "stranger danger" / body-safety education. Those keep getting normal
// answers.

// Unambiguous on their own — no realistic ordinary-parenting sentence
// contains these, so a bare match is enough.
const STRONG_TRIGGER_PATTERN = new RegExp(
  [
    "\\bsex\\b",
    "\\bsexual(ly|ity)?\\b",
    "\\bpuberty\\b",
    "\\bintercourse\\b",
    "\\bmasturbat\\w*\\b",
    "\\bporn(ography|ographic)?\\b",
    "\\bmolest\\w*\\b",
    "\\brape[ds]?\\b",
    "\\brapist\\b",
    "\\bincest\\b",
    "\\bgenital\\w*\\b",
    "\\bpenis(es)?\\b",
    "\\bvagina(l)?\\b",
    "\\bvulva\\b",
    "\\bsex\\s?ed(ucation)?\\b",
    "\\bprivate\\s+parts?\\b",
    "\\bsexually\\s+abus\\w*\\b"
  ].join("|"),
  "i"
);

// Ambiguous ALONE (each also has a common, totally unrelated everyday
// meaning), so these only trigger together, anywhere in the same
// message — e.g. "touch" + "inappropriately" catches "he touched her
// inappropriately" / "touched inappropriately" / "inappropriately
// touched him" in any word order/distance, without "don't touch the
// stove" or "that joke was inappropriate" alone ever triggering.
// Likewise "groom(ing)" alone is a haircare/hygiene word ("grooming
// habits") far more often than a predatory one; only counted alongside
// a term that actually signals the predatory sense.
const COMPOUND_TRIGGERS = [
  [/\btouch\w*\b/i, /\binappropriat\w*\b/i],
  [/\bgroom(ed|ing)?\b/i, /\b(online|internet|predator|stranger|social media|app|chat(room)?|adult)\b/i]
];

function mentionsSexualTopic(text) {
  if (!text) return false;
  if (STRONG_TRIGGER_PATTERN.test(text)) return true;
  return COMPOUND_TRIGGERS.some(([a, b]) => a.test(text) && b.test(text));
}

const SEXUAL_TOPIC_REPLY =
  "That's outside what this app is built to help with — sexual topics, including a child's sexual development or any concern about abuse, deserve a real conversation with a professional, not a chatbot. Please reach out to your child's pediatrician, a licensed counselor or therapist, or, if there's any concern about abuse or immediate danger, the Childhelp National Child Abuse Hotline (1-800-422-4453, 24/7) or 911. I'm glad to help with anything else about your family.";

module.exports = { mentionsSexualTopic, SEXUAL_TOPIC_REPLY };
