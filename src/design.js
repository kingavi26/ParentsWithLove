// Backs the live "Design Mode" visual editor (public/design.js) — a
// Divi-style in-page editor that lets a logged-in admin restyle the real
// parent-facing app (colors/fonts, a handful of text fields, and the order
// of a couple of repeated block groups) without a code change or redeploy.
//
// Everything an admin saves here lives in ONE row of the existing generic
// app_settings key/value table (see src/db.js — the same table
// src/prompt.js already uses for the BASE_RULES override), under the key
// "design_settings". No schema migration needed. Shape:
//
//   {
//     theme:   { "--accent": "#2e5aa8", "--font-body": "'Lora', ..." },
//     content: { "hero-title": "Custom headline" },
//     order:   { "home-quick-actions": ["bedtime", "sibling", ...] }
//   }
//
// Every key above is optional and additive — an empty {} (or a missing
// key) just means "use the value already in index.html/styles.css". This
// is deliberate: it means a fresh deploy with no admin overrides yet
// renders byte-identical to today's shipped page.

const { db } = require("./db");

const DESIGN_SETTINGS_KEY = "design_settings";

// ---------------- allowlists ----------------
//
// Every one of these is enforced server-side (never trust the client) —
// the values below are also sent back to the frontend as "schema" so the
// in-page editor can build its controls from a single source of truth
// instead of duplicating this list in two files.

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Curated so a font choice can never inject arbitrary CSS and never
// depends on a font this app doesn't already load — every option here is
// either one of the two Google Fonts already linked in index.html/admin.html
// (Lora, Work Sans) or a safe, universally available system stack.
const ALLOWED_FONTS = [
  {
    value: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    label: "SF Pro / System (default body)"
  },
  {
    value: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
    label: "SF Pro Display / System (default display)"
  },
  { value: "'Work Sans', system-ui, -apple-system, sans-serif", label: "Work Sans (sans)" },
  { value: "'Lora', Georgia, serif", label: "Lora (serif)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica (sans)" },
  { value: "system-ui, -apple-system, sans-serif", label: "System UI (sans)" },
  { value: "'Courier New', ui-monospace, monospace", label: "Courier (monospace)" }
];
const ALLOWED_FONT_VALUES = new Set(ALLOWED_FONTS.map((f) => f.value));

// type "color" -> hex-validated, stored/rendered as-is.
// type "font" -> must be one of ALLOWED_FONTS' values above.
// type "range" -> a bounded number; `unit` (default "") is appended when
// stored, so the saved value is a complete, ready-to-use CSS value (e.g.
// "1.4" for a bare multiplier used inside calc(), or "860px" for a length
// used directly). min/max/step describe the slider the client should show.
const ALLOWED_THEME_VARS = {
  "--accent": { label: "Accent (buttons, links)", type: "color", group: "Colors" },
  "--accent-tint": { label: "Accent (tint, e.g. icon circles)", type: "color", group: "Colors" },
  "--accent-contrast": { label: "Text on accent", type: "color", group: "Colors" },
  "--bg": { label: "Page background", type: "color", group: "Colors" },
  "--surface": { label: "Card surface", type: "color", group: "Colors" },
  "--surface-sunken": { label: "Sunken surface", type: "color", group: "Colors" },
  "--text": { label: "Body text", type: "color", group: "Colors" },
  "--muted": { label: "Muted text", type: "color", group: "Colors" },
  "--border": { label: "Borders", type: "color", group: "Colors" },
  "--error": { label: "Errors / destructive actions", type: "color", group: "Colors" },
  "--honey": { label: "Logo spark / small accent", type: "color", group: "Colors" },
  "--honey-tint": { label: "Small accent (tint)", type: "color", group: "Colors" },
  "--plum": { label: "Logo heart / secondary accent", type: "color", group: "Colors" },
  "--plum-tint": { label: "Secondary accent (tint)", type: "color", group: "Colors" },
  "--note-bg": { label: "Pinned note background", type: "color", group: "Colors" },
  "--bubble-user-bg": { label: "Your chat bubble", type: "color", group: "Colors" },
  "--bubble-user-text": { label: "Your chat bubble text", type: "color", group: "Colors" },
  "--bubble-bot-bg": { label: "Assistant chat bubble", type: "color", group: "Colors" },
  "--bubble-bot-text": { label: "Assistant chat bubble text", type: "color", group: "Colors" },
  "--font-body": { label: "Body font", type: "font", group: "Fonts" },
  "--font-display": { label: "Heading font", type: "font", group: "Fonts" },
  "--radius-scale": {
    label: "Corner roundness",
    type: "range",
    group: "Layout",
    min: 0,
    max: 2,
    step: 0.1,
    unit: ""
  },
  "--shadow-opacity": {
    label: "Card shadow strength",
    type: "range",
    group: "Layout",
    min: 0,
    max: 0.3,
    step: 0.01,
    unit: ""
  },
  "--content-max-width": {
    label: "Page width",
    type: "range",
    group: "Layout",
    min: 600,
    max: 1200,
    step: 20,
    unit: "px"
  }
};

// Every id here must match a real `data-editable="<id>"` attribute in
// public/index.html. maxLen is generous but bounded — these render as
// plain textContent (never innerHTML) on the client, same convention the
// rest of this app already uses for anything a user can type. `attr`
// defaults to "textContent"; a field with a different `attr` (currently
// only "placeholder") targets an HTML attribute instead — used for form
// fields, which can't be edited in place with contenteditable, so the
// in-page editor exposes those as a plain text input in its panel instead.
const ALLOWED_EDITABLE = {
  // Brand
  "brand-parents": { label: "Brand name — \"Parents\"", maxLen: 40, group: "Brand" },
  "brand-with": { label: "Brand name — \"with\"", maxLen: 20, group: "Brand" },
  "brand-love": { label: "Brand name — \"Love\"", maxLen: 40, group: "Brand" },
  "hero-eyebrow": { label: "Eyebrow label above the title", maxLen: 80, group: "Brand" },
  "hero-title": { label: "Main headline", maxLen: 120, group: "Brand" },
  "hero-subtitle": { label: "Subheadline", maxLen: 300, group: "Brand" },

  // Auth screen
  "auth-tab-login": { label: "Auth tab: \"Log in\"", maxLen: 30, group: "Auth screen" },
  "auth-tab-signup": { label: "Auth tab: \"Sign up\"", maxLen: 30, group: "Auth screen" },
  "field-email-label": { label: "Email field label", maxLen: 30, group: "Auth screen" },
  "field-password-label": { label: "Password field label", maxLen: 30, group: "Auth screen" },
  "social-divider-or": { label: "Social login divider (\"or\")", maxLen: 10, group: "Auth screen" },
  "social-apple-btn": { label: "Apple login button", maxLen: 40, group: "Auth screen" },
  "social-google-btn": { label: "Google login button", maxLen: 40, group: "Auth screen" },
  "social-facebook-btn": { label: "Facebook login button", maxLen: 40, group: "Auth screen" },

  // Home screen
  "home-section-label": { label: "\"Ask about…\" label", maxLen: 60, group: "Home screen" },
  "quick-action-sibling-label": { label: "Quick action: sibling conflict", maxLen: 60, group: "Home screen" },
  "quick-action-bedtime-label": { label: "Quick action: bedtime battles", maxLen: 60, group: "Home screen" },
  "quick-action-tantrums-label": { label: "Quick action: tantrums", maxLen: 60, group: "Home screen" },
  "quick-action-screen-time-label": { label: "Quick action: screen time", maxLen: 60, group: "Home screen" },
  "home-continue-btn": { label: "\"Continue chatting\" button", maxLen: 60, group: "Home screen" },

  // Chat screen
  "chat-title": { label: "Chat card title", maxLen: 60, group: "Chat screen" },
  "chat-input-placeholder": {
    label: "Chat input placeholder",
    maxLen: 80,
    group: "Chat screen",
    attr: "placeholder"
  },
  "chat-send-btn": { label: "Send button", maxLen: 20, group: "Chat screen" },
  "rate-session-link": { label: "\"Rate this session\" link", maxLen: 150, group: "Chat screen" },
  "review-panel-heading": { label: "Self-review panel heading", maxLen: 40, group: "Chat screen" },

  // Memory screen
  "memory-heading": { label: "Memory screen heading", maxLen: 40, group: "Memory screen" },
  "memory-label-children": { label: "\"Children\" label", maxLen: 30, group: "Memory screen" },
  "memory-label-topics": { label: "\"Topics discussed\" label", maxLen: 30, group: "Memory screen" },
  "memory-label-notes": { label: "\"Notes\" label", maxLen: 30, group: "Memory screen" },

  // Account settings modal
  "account-modal-heading": { label: "Account modal heading", maxLen: 40, group: "Account settings" },
  "account-email-section-label": { label: "\"Email\" section label", maxLen: 30, group: "Account settings" },
  "account-children-label": { label: "\"Children we remember\" label", maxLen: 60, group: "Account settings" },
  "account-children-hint": { label: "Children section hint text", maxLen: 300, group: "Account settings" },
  "account-memory-label": { label: "\"Topics & notes\" label", maxLen: 60, group: "Account settings" },
  "account-memory-hint": { label: "Topics & notes hint text", maxLen: 300, group: "Account settings" },
  "account-topics-subhead": { label: "\"Topics discussed\" subhead", maxLen: 30, group: "Account settings" },
  "account-notes-subhead": { label: "\"Notes\" subhead", maxLen: 30, group: "Account settings" },
  "account-data-label": { label: "\"Your data\" label", maxLen: 40, group: "Account settings" },
  "account-data-hint": { label: "\"Your data\" hint text", maxLen: 300, group: "Account settings" },
  "account-export-btn": { label: "Export data button", maxLen: 60, group: "Account settings" },
  "account-delete-label": { label: "\"Delete account\" label", maxLen: 40, group: "Account settings" },
  "account-delete-copy": { label: "Delete-account warning text", maxLen: 300, group: "Account settings" },
  "account-delete-btn": { label: "\"Delete my account…\" button", maxLen: 40, group: "Account settings" },
  "account-delete-confirm-btn": { label: "Final delete-confirm button", maxLen: 60, group: "Account settings" },

  // Disclaimer modal
  "disclaimer-heading": { label: "Disclaimer modal heading", maxLen: 40, group: "Disclaimer" },
  "disclaimer-p1": { label: "Disclaimer paragraph 1 (AI-generated)", maxLen: 400, group: "Disclaimer" },
  "disclaimer-p2": { label: "Disclaimer paragraph 2 (not medical advice)", maxLen: 500, group: "Disclaimer" },
  "disclaimer-crisis-label": { label: "Crisis warning (bold lead-in)", maxLen: 150, group: "Disclaimer" },
  "disclaimer-crisis-text": { label: "Crisis warning (rest of sentence)", maxLen: 200, group: "Disclaimer" },
  "disclaimer-data-label": { label: "\"How your data is handled\" lead-in", maxLen: 60, group: "Disclaimer" },
  "disclaimer-p-final": { label: "Disclaimer closing paragraph", maxLen: 400, group: "Disclaimer" },

  // Footer
  "footer-heads-up-label": { label: "Footer \"Heads up:\" label", maxLen: 40, group: "Footer" },
  "footer-disclaimer-text": { label: "Footer disclaimer sentence", maxLen: 300, group: "Footer" },
  "footer-more-link": { label: "\"Read the full disclaimer\" link", maxLen: 60, group: "Footer" },
  "footer-privacy-link": { label: "\"Privacy policy\" link", maxLen: 40, group: "Footer" },

  // Privacy page (public/privacy.html) — deliberately limited to the
  // heading and date line, not the legal body text itself: several of
  // those paragraphs carry inline <strong>/<a> tags that a textContent-only
  // save would silently strip (same reasoning as the disclaimer fields
  // above), so the legal copy stays a code change rather than an in-page
  // edit.
  "privacy-page-heading": { label: "Privacy page heading", maxLen: 60, group: "Privacy page" },
  "privacy-page-updated": { label: "Privacy page \"last updated\" line", maxLen: 150, group: "Privacy page" },

  // Sources page (public/sources.html) — same limited scope as above.
  "sources-page-heading": { label: "Sources page heading", maxLen: 60, group: "Sources page" },
  "sources-page-updated": { label: "Sources page \"last checked\" line", maxLen: 150, group: "Sources page" },
  "sources-list-heading": { label: "\"The organizations\" heading", maxLen: 60, group: "Sources page" }
};

// Every group must match a real `data-reorder-group="<group>"` container
// in public/index.html, whose direct children carry `data-reorder-id`
// values drawn from exactly this item list (order here is just the
// server's reference set for validation, not a default order).
const ALLOWED_REORDER_GROUPS = {
  "home-quick-actions": {
    label: "Home screen quick-action cards",
    items: [
      { id: "sibling", label: "Sibling conflict" },
      { id: "bedtime", label: "Bedtime battles" },
      { id: "tantrums", label: "Tantrums" },
      { id: "screen-time", label: "Screen time" }
    ]
  },
  "app-nav": {
    label: "Bottom/side navigation",
    items: [
      { id: "home", label: "Home" },
      { id: "chat", label: "Chat" },
      { id: "memory", label: "Memory" },
      { id: "settings", label: "Settings" }
    ]
  },
  "memory-sections": {
    label: "Memory screen sections",
    items: [
      { id: "children", label: "Children" },
      { id: "topics", label: "Topics discussed" },
      { id: "notes", label: "Notes" }
    ]
  }
};

function emptySettings() {
  return { theme: {}, content: {}, order: {} };
}

function getDesignSettings() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(DESIGN_SETTINGS_KEY);
  if (!row || !row.value) return emptySettings();
  try {
    const parsed = JSON.parse(row.value);
    return {
      theme: (parsed && typeof parsed.theme === "object" && parsed.theme) || {},
      content: (parsed && typeof parsed.content === "object" && parsed.content) || {},
      order: (parsed && typeof parsed.order === "object" && parsed.order) || {}
    };
  } catch (err) {
    // Corrupt/unexpected value — fail safe to "no overrides" rather than
    // ever throwing on a live page load.
    return emptySettings();
  }
}

function saveDesignSettings(settings) {
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(DESIGN_SETTINGS_KEY, JSON.stringify(settings));
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
    reorderGroups: ALLOWED_REORDER_GROUPS
  };
}

function getDesignPayload() {
  return { settings: getDesignSettings(), schema: getSchema() };
}

// Returns { error } on failure, or { settings } on success — callers map
// that straight to a 400 vs 200 JSON response.
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
        return { error: `"${key}" must be a hex color like #2e5aa8.` };
      }
      nextTheme[key] = value.trim();
    } else if (def.type === "font") {
      if (!ALLOWED_FONT_VALUES.has(value)) {
        return { error: `"${key}" must be one of the provided font choices.` };
      }
      nextTheme[key] = value;
    } else if (def.type === "range") {
      // Accept either a bare number or the same value with its expected
      // unit already appended (the client's own display can round-trip
      // through here) — either way, re-derive the number and re-append
      // the canonical unit ourselves so nothing but a validated number
      // ever reaches the stored CSS value.
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
    // Empty text reverts to whatever's hard-coded in index.html rather
    // than saving/rendering a blank field.
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

function resetDesign(scope) {
  const settings = getDesignSettings();
  if (scope === "theme" || scope === "all") settings.theme = {};
  if (scope === "content" || scope === "all") settings.content = {};
  if (scope === "order" || scope === "all") settings.order = {};
  saveDesignSettings(settings);
  return settings;
}

module.exports = {
  getDesignPayload,
  getDesignSettings,
  updateTheme,
  updateContent,
  updateOrder,
  resetDesign,
  ALLOWED_THEME_VARS,
  ALLOWED_EDITABLE,
  ALLOWED_REORDER_GROUPS
};
