// Backs a second, independent "Design Mode" visual editor — this one for
// the marketing/landing page (public/index.html + public/landing.css)
// rather than the parent-facing app (public/app.html + public/styles.css,
// see src/design.js). Kept as a fully separate module/settings row/route
// set on purpose: landing.css was deliberately built with "zero dependency
// on the app's Design Mode override system" (see its header comment) so
// that editing one page's design can never collide with or accidentally
// touch the other's. Same architecture and conventions as src/design.js
// throughout, just pointed at a different page's tokens/fields/groups.
//
// Everything an admin saves here lives in ONE row of the existing generic
// app_settings key/value table, under the key "landing_design_settings".
// Shape:
//
//   {
//     theme:   { "--accent": "#c08a2e", "--font-display": "..." },
//     content: { "hero-title-accent": "remembers your family" },
//     order:   { "landing-sections": ["chat-demo", "features", ...] },
//     hidden:  ["why-not-search"]
//   }
//
// Every key above is optional and additive — an empty {}/[] (or a missing
// key) just means "use the value already shipped in index.html/landing.css".
// A fresh deploy with no admin overrides yet renders byte-identical to
// today's shipped page.

const { db } = require("./db");

const LANDING_DESIGN_SETTINGS_KEY = "landing_design_settings";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Curated so a font choice can never inject arbitrary CSS and never depends
// on a font this page doesn't already load — every option here is either
// one of the two Google Fonts already linked in index.html (Libre
// Baskerville, PT Sans) or a safe, universally available system stack.
const ALLOWED_FONTS = [
  { value: "'Libre Baskerville', Georgia, 'Times New Roman', serif", label: "Libre Baskerville (default display)" },
  { value: "'PT Sans', -apple-system, sans-serif", label: "PT Sans (default body)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif", label: "System sans" },
  { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica (sans)" },
  { value: "system-ui, -apple-system, sans-serif", label: "System UI (sans)" },
  { value: "'Courier New', ui-monospace, monospace", label: "Courier (monospace)" }
];
const ALLOWED_FONT_VALUES = new Set(ALLOWED_FONTS.map((f) => f.value));

// type "color" -> hex-validated. type "font" -> must be one of ALLOWED_FONTS.
// type "range" -> a bounded number; `unit` (default "") is appended so the
// saved value is a ready-to-use CSS value.
const ALLOWED_THEME_VARS = {
  "--navy": { label: "Headings & primary buttons", type: "color", group: "Colors" },
  "--accent": { label: "Accent (gold — eyebrows, links, nav CTA)", type: "color", group: "Colors" },
  "--accent-tint": { label: "Accent (tint, e.g. focus rings)", type: "color", group: "Colors" },
  "--bg": { label: "Page background", type: "color", group: "Colors" },
  "--surface": { label: "Card surface", type: "color", group: "Colors" },
  "--surface-sunken": { label: "Sunken surface (chat demo band)", type: "color", group: "Colors" },
  "--surface-alt": { label: "Alt tinted section background", type: "color", group: "Colors" },
  "--text": { label: "Body text", type: "color", group: "Colors" },
  "--muted": { label: "Muted text", type: "color", group: "Colors" },
  "--muted-light": { label: "Lighter muted text (notes, captions)", type: "color", group: "Colors" },
  "--border": { label: "Borders", type: "color", group: "Colors" },
  "--font-body": { label: "Body font", type: "font", group: "Fonts" },
  "--font-display": { label: "Heading font", type: "font", group: "Fonts" },
  "--max-width": {
    label: "Page width",
    type: "range",
    group: "Layout",
    min: 780,
    max: 1280,
    step: 20,
    unit: "px"
  }
};

// Every id here must match a real `data-editable="<id>"` attribute in
// public/index.html. Renders as plain textContent (never innerHTML) on the
// client, same convention as the app's editor. `attr` defaults to
// "textContent"; nothing on this page currently needs an attr-backed field.
const ALLOWED_EDITABLE = {
  // Nav
  "brand-parents": { label: "Brand name — \"Parents\"", maxLen: 40, group: "Nav & brand" },
  "brand-with": { label: "Brand name — \"with\"", maxLen: 20, group: "Nav & brand" },
  "brand-love": { label: "Brand name — \"Love\"", maxLen: 40, group: "Nav & brand" },
  "beta-pill": { label: "\"Beta\" pill", maxLen: 20, group: "Nav & brand" },
  "nav-login-link": { label: "\"Log in\" link", maxLen: 30, group: "Nav & brand" },
  "nav-cta": { label: "Nav \"Get beta access\" button", maxLen: 40, group: "Nav & brand" },

  // Hero
  "hero-eyebrow": { label: "\"Now in beta\" eyebrow", maxLen: 40, group: "Hero" },
  "hero-title-plain": { label: "Headline (first part)", maxLen: 80, group: "Hero" },
  "hero-title-accent": { label: "Headline (highlighted part)", maxLen: 80, group: "Hero" },
  "hero-subtitle": { label: "Subheadline", maxLen: 300, group: "Hero" },
  "hero-cta-btn": { label: "Hero signup button", maxLen: 40, group: "Hero" },
  "hero-signup-note": { label: "Hero signup note", maxLen: 150, group: "Hero" },

  // See it in action
  "chat-demo-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "See it in action" },
  "chat-demo-heading": { label: "Heading", maxLen: 120, group: "See it in action" },
  "chat-demo-body": { label: "Paragraph", maxLen: 300, group: "See it in action" },
  "chat-demo-cta-btn": { label: "CTA button", maxLen: 40, group: "See it in action" },
  "chat-demo-link": { label: "\"How it works\" link", maxLen: 40, group: "See it in action" },
  "chat-demo-msg-1": { label: "Chat bubble 1 (parent)", maxLen: 150, group: "See it in action" },
  "chat-demo-msg-2": { label: "Chat bubble 2 (assistant)", maxLen: 200, group: "See it in action" },
  "chat-demo-msg-3": { label: "Chat bubble 3 (parent)", maxLen: 150, group: "See it in action" },

  // App demo
  "app-demo-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "App demo" },
  "app-demo-heading": { label: "Heading", maxLen: 120, group: "App demo" },
  "app-demo-subheading": { label: "Subheading", maxLen: 300, group: "App demo" },
  "app-demo-caption-1-title": { label: "Home screen caption title", maxLen: 60, group: "App demo" },
  "app-demo-caption-1-body": { label: "Home screen caption body", maxLen: 200, group: "App demo" },
  "app-demo-caption-2-title": { label: "Chat screen caption title", maxLen: 60, group: "App demo" },
  "app-demo-caption-2-body": { label: "Chat screen caption body", maxLen: 200, group: "App demo" },
  "app-demo-caption-3-title": { label: "Memory screen caption title", maxLen: 60, group: "App demo" },
  "app-demo-caption-3-body": { label: "Memory screen caption body", maxLen: 200, group: "App demo" },
  "app-demo-cta-btn": { label: "\"Get beta access\" button", maxLen: 40, group: "App demo" },
  "app-demo-try-btn": { label: "\"Try the live demo\" button", maxLen: 40, group: "App demo" },
  "app-demo-note": { label: "Note under the buttons", maxLen: 150, group: "App demo" },

  // What it helps with
  "features-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "What it helps with" },
  "features-heading": { label: "Heading", maxLen: 120, group: "What it helps with" },
  "feature-sibling-title": { label: "Card 1 title", maxLen: 60, group: "What it helps with" },
  "feature-sibling-body": { label: "Card 1 description", maxLen: 200, group: "What it helps with" },
  "feature-bedtime-title": { label: "Card 2 title", maxLen: 60, group: "What it helps with" },
  "feature-bedtime-body": { label: "Card 2 description", maxLen: 200, group: "What it helps with" },
  "feature-tantrums-title": { label: "Card 3 title", maxLen: 60, group: "What it helps with" },
  "feature-tantrums-body": { label: "Card 3 description", maxLen: 200, group: "What it helps with" },
  "feature-screen-title": { label: "Card 4 title", maxLen: 60, group: "What it helps with" },
  "feature-screen-body": { label: "Card 4 description", maxLen: 200, group: "What it helps with" },

  // How it works
  "steps-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "How it works" },
  "steps-heading": { label: "Heading", maxLen: 120, group: "How it works" },
  "steps-subheading": { label: "Subheading", maxLen: 200, group: "How it works" },
  "step-1-label": { label: "Step 1 label", maxLen: 60, group: "How it works" },
  "step-1-body": { label: "Step 1 description", maxLen: 200, group: "How it works" },
  "step-2-label": { label: "Step 2 label", maxLen: 60, group: "How it works" },
  "step-2-body": { label: "Step 2 description", maxLen: 200, group: "How it works" },
  "step-3-label": { label: "Step 3 label", maxLen: 60, group: "How it works" },
  "step-3-body": { label: "Step 3 description", maxLen: 200, group: "How it works" },
  "step-4-label": { label: "Step 4 label", maxLen: 60, group: "How it works" },
  "step-4-body": { label: "Step 4 description", maxLen: 200, group: "How it works" },
  "step-5-label": { label: "Step 5 label", maxLen: 60, group: "How it works" },
  "step-5-body": { label: "Step 5 description", maxLen: 200, group: "How it works" },
  "step-6-label": { label: "Step 6 label", maxLen: 60, group: "How it works" },
  "step-6-body": { label: "Step 6 description", maxLen: 200, group: "How it works" },

  // Why not just search it
  "compare-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "Why not just search it" },
  "compare-heading": { label: "Heading", maxLen: 120, group: "Why not just search it" },
  "compare-negative-label": { label: "Negative column label", maxLen: 40, group: "Why not just search it" },
  "compare-negative-1": { label: "Negative item 1", maxLen: 150, group: "Why not just search it" },
  "compare-negative-2": { label: "Negative item 2", maxLen: 150, group: "Why not just search it" },
  "compare-negative-3": { label: "Negative item 3", maxLen: 150, group: "Why not just search it" },
  "compare-negative-4": { label: "Negative item 4", maxLen: 150, group: "Why not just search it" },
  "compare-positive-label": { label: "Positive column label", maxLen: 40, group: "Why not just search it" },
  "compare-positive-1": { label: "Positive item 1", maxLen: 150, group: "Why not just search it" },
  "compare-positive-2": { label: "Positive item 2", maxLen: 150, group: "Why not just search it" },
  "compare-positive-3": { label: "Positive item 3", maxLen: 150, group: "Why not just search it" },
  "compare-positive-4": { label: "Positive item 4", maxLen: 150, group: "Why not just search it" },

  // Privacy
  "privacy-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "Privacy" },
  "privacy-heading": { label: "Heading", maxLen: 120, group: "Privacy" },
  "privacy-secure-title": { label: "Card 1 title", maxLen: 60, group: "Privacy" },
  "privacy-secure-body": { label: "Card 1 description", maxLen: 200, group: "Privacy" },
  "privacy-memory-title": { label: "Card 2 title", maxLen: 60, group: "Privacy" },
  "privacy-memory-body": { label: "Card 2 description", maxLen: 200, group: "Privacy" },
  "privacy-control-title": { label: "Card 3 title", maxLen: 60, group: "Privacy" },
  "privacy-control-body": { label: "Card 3 description", maxLen: 200, group: "Privacy" },
  "privacy-facts-title": { label: "Card 4 title", maxLen: 60, group: "Privacy" },
  "privacy-facts-body": { label: "Card 4 description", maxLen: 200, group: "Privacy" },

  // Sources
  "sources-eyebrow": { label: "Eyebrow label", maxLen: 40, group: "Research credibility" },
  "sources-heading": { label: "Heading", maxLen: 120, group: "Research credibility" },
  "sources-subheading": { label: "Subheading", maxLen: 200, group: "Research credibility" },

  // Final CTA
  "final-cta-heading": { label: "Heading", maxLen: 120, group: "Final signup" },
  "final-cta-body": { label: "Paragraph", maxLen: 300, group: "Final signup" },
  "final-cta-btn": { label: "Button", maxLen: 40, group: "Final signup" },
  "final-cta-note": { label: "Note under button", maxLen: 150, group: "Final signup" },

  // Footer
  "footer-copyright": { label: "Copyright line", maxLen: 80, group: "Footer" },
  "footer-sources-link": { label: "\"Sources\" link", maxLen: 30, group: "Footer" },
  "footer-privacy-link": { label: "\"Privacy\" link", maxLen: 30, group: "Footer" },
  "footer-login-link": { label: "\"Already in the beta?\" link", maxLen: 60, group: "Footer" }
};

// Every group must match a real `data-reorder-group="<group>"` container in
// public/index.html, whose direct children carry `data-reorder-id` values
// drawn from exactly this item list.
const ALLOWED_REORDER_GROUPS = {
  "landing-sections": {
    label: "Page sections (between the hero and the final signup)",
    items: [
      { id: "chat-demo", label: "See it in action" },
      { id: "app-demo", label: "App demo (screens)" },
      { id: "features", label: "What it helps with" },
      { id: "how-it-works", label: "How it works (six steps)" },
      { id: "why-not-search", label: "Why not just search it" },
      { id: "privacy", label: "Privacy & safety" },
      { id: "sources", label: "Research credibility" }
    ]
  },
  "feature-cards": {
    label: "\"What it helps with\" cards",
    items: [
      { id: "sibling", label: "Sibling conflict" },
      { id: "bedtime", label: "Bedtime battles" },
      { id: "tantrums", label: "Tantrums" },
      { id: "screen-time", label: "Screen time" }
    ]
  },
  "privacy-cards": {
    label: "Privacy cards",
    items: [
      { id: "secure", label: "Secure by default" },
      { id: "memory", label: "Deliberately limited memory" },
      { id: "control", label: "Full control, always" },
      { id: "facts", label: "Never invents facts" }
    ]
  }
};

// A section can be hidden entirely, in addition to being reordered — only
// the discretionary content sections qualify (not the hero, final signup,
// nav, or footer, which are structural/always-on). Deliberately the same
// id set as the "landing-sections" reorder group above.
const HIDEABLE_SECTION_IDS = ALLOWED_REORDER_GROUPS["landing-sections"].items.map((i) => i.id);

function emptySettings() {
  return { theme: {}, content: {}, order: {}, hidden: [] };
}

function getDesignSettings() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(LANDING_DESIGN_SETTINGS_KEY);
  if (!row || !row.value) return emptySettings();
  try {
    const parsed = JSON.parse(row.value);
    return {
      theme: (parsed && typeof parsed.theme === "object" && parsed.theme) || {},
      content: (parsed && typeof parsed.content === "object" && parsed.content) || {},
      order: (parsed && typeof parsed.order === "object" && parsed.order) || {},
      hidden: (parsed && Array.isArray(parsed.hidden) && parsed.hidden) || []
    };
  } catch (err) {
    return emptySettings();
  }
}

function saveDesignSettings(settings) {
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(LANDING_DESIGN_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

function getSchema() {
  return {
    themeVars: Object.keys(ALLOWED_THEME_VARS).map((name) => {
      const def = ALLOWED_THEME_VARS[name];
      const field = { name, label: def.label, type: def.type, group: def.group || "" };
      if (def.type === "range") {
        field.min = def.min;
        field.max = def.max;
        field.step = def.step;
        field.unit = def.unit || "";
      }
      return field;
    }),
    fonts: ALLOWED_FONTS,
    editableFields: Object.keys(ALLOWED_EDITABLE).map((id) => ({
      id,
      label: ALLOWED_EDITABLE[id].label,
      maxLen: ALLOWED_EDITABLE[id].maxLen,
      group: ALLOWED_EDITABLE[id].group || "",
      attr: ALLOWED_EDITABLE[id].attr || "textContent"
    })),
    reorderGroups: ALLOWED_REORDER_GROUPS,
    hideableSections: HIDEABLE_SECTION_IDS.map((id) => {
      const item = ALLOWED_REORDER_GROUPS["landing-sections"].items.find((i) => i.id === id);
      return { id, label: item ? item.label : id };
    })
  };
}

function getDesignPayload() {
  return { settings: getDesignSettings(), schema: getSchema() };
}

function updateTheme(varsPatch) {
  if (!varsPatch || typeof varsPatch !== "object" || Array.isArray(varsPatch)) {
    return { error: "Expected { vars: { \"--name\": value, ... } }." };
  }
  const settings = getDesignSettings();
  const nextTheme = Object.assign({}, settings.theme);

  for (const key of Object.keys(varsPatch)) {
    const def = ALLOWED_THEME_VARS[key];
    if (!def) return { error: `"${key}" isn't an editable design token.` };
    const value = varsPatch[key];

    if (value == null || value === "") {
      delete nextTheme[key];
      continue;
    }
    if (typeof value !== "string") {
      return { error: `"${key}" must be a string.` };
    }
    if (def.type === "color") {
      if (!HEX_COLOR_RE.test(value.trim())) {
        return { error: `"${key}" must be a hex color like #1f3552.` };
      }
      nextTheme[key] = value.trim();
    } else if (def.type === "font") {
      if (!ALLOWED_FONT_VALUES.has(value)) {
        return { error: `"${key}" must be one of the provided font choices.` };
      }
      nextTheme[key] = value;
    } else if (def.type === "range") {
      const numeric = parseFloat(String(value).replace(def.unit || "", "").trim());
      if (!Number.isFinite(numeric) || numeric < def.min || numeric > def.max) {
        return { error: `"${key}" must be a number between ${def.min} and ${def.max}.` };
      }
      nextTheme[key] = `${numeric}${def.unit || ""}`;
    }
  }

  settings.theme = nextTheme;
  saveDesignSettings(settings);
  return { settings };
}

function updateContent(id, text) {
  const def = ALLOWED_EDITABLE[id];
  if (!def) return { error: `"${id}" isn't an editable field.` };
  if (typeof text !== "string") return { error: "Expected a string." };

  const trimmed = text.trim();
  const settings = getDesignSettings();
  const nextContent = Object.assign({}, settings.content);

  if (!trimmed) {
    delete nextContent[id];
  } else {
    if (trimmed.length > def.maxLen) {
      return { error: `"${id}" can't be longer than ${def.maxLen} characters.` };
    }
    nextContent[id] = trimmed;
  }

  settings.content = nextContent;
  saveDesignSettings(settings);
  return { settings };
}

function updateOrder(group, order) {
  const def = ALLOWED_REORDER_GROUPS[group];
  if (!def) return { error: `"${group}" isn't a reorderable group.` };
  if (!Array.isArray(order)) return { error: "Expected { order: [ids...] }." };

  const allowedIds = def.items.map((i) => i.id);
  const isSamePermutation =
    order.length === allowedIds.length &&
    allowedIds.every((id) => order.includes(id)) &&
    new Set(order).size === order.length;

  if (!isSamePermutation) {
    return { error: `Order must contain exactly these ids, each once: ${allowedIds.join(", ")}.` };
  }

  const settings = getDesignSettings();
  settings.order = Object.assign({}, settings.order, { [group]: order });
  saveDesignSettings(settings);
  return { settings };
}

function updateVisibility(id, visible) {
  if (!HIDEABLE_SECTION_IDS.includes(id)) return { error: `"${id}" isn't a hideable section.` };
  if (typeof visible !== "boolean") return { error: "Expected a boolean." };

  const settings = getDesignSettings();
  const hiddenSet = new Set(settings.hidden || []);
  if (visible) hiddenSet.delete(id);
  else hiddenSet.add(id);
  settings.hidden = Array.from(hiddenSet);
  saveDesignSettings(settings);
  return { settings };
}

function resetDesign(scope) {
  const settings = getDesignSettings();
  if (scope === "theme" || scope === "all") settings.theme = {};
  if (scope === "content" || scope === "all") settings.content = {};
  if (scope === "order" || scope === "all") settings.order = {};
  if (scope === "hidden" || scope === "all") settings.hidden = [];
  saveDesignSettings(settings);
  return settings;
}

module.exports = {
  getDesignPayload,
  getDesignSettings,
  updateTheme,
  updateContent,
  updateOrder,
  updateVisibility,
  resetDesign,
  ALLOWED_THEME_VARS,
  ALLOWED_EDITABLE,
  ALLOWED_REORDER_GROUPS,
  HIDEABLE_SECTION_IDS
};
