// A small, fixed, hand-curated library of reputable general-audience
// child-development and parenting organizations — NOT a per-claim citation
// system. pwl7's reply pipeline (see reply-engine.js/prompt.js) doesn't do
// retrieval against a paper database, so asking the model to invent a
// specific study/URL for each individual sentence it writes would risk
// showing real parents fabricated citations. Instead, every reply is
// tagged — by a deterministic keyword match against the ROUTER's own topic
// classification (see sourcesForHints below), never by the model
// free-associating — with 1-3 real, stable ORGANIZATION links whose
// published guidance covers the general topic the reply addressed. That's
// an honest "this kind of guidance draws on..." pointer, not a claim that
// a specific sentence came from a specific study.
//
// Every URL below was hand-checked live on 2026-09-09. Keep this list
// small and only add an organization here once its URL has been verified.

// `monogram` is a short, hand-curated typographic initialism used only for
// the landing page's "grounded in real research" credibility grid — an
// original monogram-badge treatment, deliberately NOT a reproduction of any
// organization's actual trademarked logo/wordmark (see landing.js). Keep
// these short (2-4 characters) and in plain caps/digits only.
const SOURCES = {
  aap: {
    id: "aap",
    org: "American Academy of Pediatrics",
    title: "HealthyChildren.org",
    url: "https://www.healthychildren.org",
    monogram: "AAP"
  },
  cdc_parenting: {
    id: "cdc_parenting",
    org: "CDC",
    title: "Positive Parenting Tips (by age)",
    url: "https://www.cdc.gov/child-development/positive-parenting-tips/index.html",
    monogram: "CDC"
  },
  zerotothree: {
    id: "zerotothree",
    org: "ZERO TO THREE",
    title: "Early childhood development resources",
    url: "https://www.zerotothree.org",
    monogram: "0–3"
  },
  gottman: {
    id: "gottman",
    org: "The Gottman Institute",
    title: "Emotion-coaching research",
    url: "https://www.gottman.com",
    monogram: "TGI"
  },
  positive_discipline: {
    id: "positive_discipline",
    org: "Positive Discipline",
    title: "Research-backed positive discipline tools",
    url: "https://www.positivediscipline.com",
    monogram: "PD"
  },
  circle_of_security: {
    id: "circle_of_security",
    org: "Circle of Security International",
    title: "Attachment-based parenting",
    url: "https://www.circleofsecurityinternational.com",
    monogram: "COS"
  },
  sleep_foundation: {
    id: "sleep_foundation",
    org: "Sleep Foundation",
    title: "Children's sleep guidance",
    url: "https://www.sleepfoundation.org",
    monogram: "SF"
  },
  common_sense_media: {
    id: "common_sense_media",
    org: "Common Sense Media",
    title: "Kids & screen time guidance",
    url: "https://www.commonsensemedia.org",
    monogram: "CSM"
  },
  child_mind: {
    id: "child_mind",
    org: "Child Mind Institute",
    title: "Child behavior & mental health resources",
    url: "https://childmind.org",
    monogram: "CMI"
  }
};

const MAX_SOURCES = 3;

// Ordered [regex, sourceIds] buckets, most specific first, checked against
// the router's own topic classification text (see sourcesForHints). The
// first buckets that match contribute their sources, until MAX_SOURCES is
// hit; if nothing matches, FALLBACK_SOURCE_IDS covers the app's own
// love-first/attachment framing.
const TOPIC_RULES = [
  [/tantrum|meltdown|big feeling|overwhelm|dysregulat|\bemotion|\bcry\b|crying|scream/i, ["gottman", "zerotothree"]],
  [/bed ?time|\bsleep|\bnap\b|night ?time|wakes? up|waking/i, ["sleep_foundation", "cdc_parenting"]],
  [/\bscreen|ipad|tablet|\btv\b|video ?game|\bphone|social media|\bmedia\b/i, ["common_sense_media", "aap"]],
  [/sibling|brother|sister|\bfight/i, ["child_mind", "zerotothree"]],
  [
    /discipline|boundary|boundaries|consequence|behavior|misbehav|defian|power struggle|\blimit/i,
    ["positive_discipline", "aap"]
  ],
  [/develop|milestone|age.appropriate|\bstage\b/i, ["cdc_parenting", "aap"]]
];

const FALLBACK_SOURCE_IDS = ["circle_of_security", "gottman"];

function sourcesForText(text) {
  if (!text) return [];
  const ids = [];
  for (const [regex, sourceIds] of TOPIC_RULES) {
    if (ids.length >= MAX_SOURCES) break;
    if (!regex.test(text)) continue;
    for (const id of sourceIds) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (ids.length === 0) {
    for (const id of FALLBACK_SOURCE_IDS) ids.push(id);
  }
  return ids.slice(0, MAX_SOURCES).map((id) => SOURCES[id]);
}

// hints: free-text strings describing what the reply was about — the
// router's own classification (primary_situation, secondary_situations,
// relevant_protocol) in real mode, or the demo-mode matched topic label.
// Always something the app already classified, never the parent's raw
// message text directly, so a parent can't steer which orgs get cited by
// how they phrase a question.
function sourcesForHints(hints) {
  return sourcesForText((hints || []).filter(Boolean).join(" "));
}

function allSources() {
  return Object.values(SOURCES);
}

module.exports = { sourcesForHints, allSources };
