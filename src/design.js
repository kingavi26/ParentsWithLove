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
  { value: "'Work Sans', system-ui, -apple-system, sans-serif", label: "Work Sans (default body)" },
  { value: "'Lora', Georgia, serif", label: "Lora (default display)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica (sans)" },
  { value: "system-ui, -apple-system, sans-serif", label: "System UI (sans)" },
  { value: "'Courier New', ui-monospace, monospace", label: "Courier (monospace)" }
];
const ALLOWED_FONT_VALUES = new Set(ALLOWED_FONTS.map((f) => f.value));

const ALLOWED_THEME_VARS = {
  "--accent": { label: "Accent (buttons, links)", type: "color" },
  "--accent-contrast": { label: "Text on accent", type: "color" },
  "--bg": { label: "Page background", type: "color" },
  "--surface": { label: "Card surface", type: "color" },
  "--surface-sunken": { label: "Sunken surface", type: "color" },
  "--text": { label: "Body text", type: "color" },
  "--muted": { label: "Muted text", type: "color" },
  "--border": { label: "Borders", type: "color" },
  "--bubble-user-bg": { label: "Your chat bubble", type: "color" },
  "--bubble-user-text": { label: "Your chat bubble text", type: "color" },
  "--bubble-bot-bg": { label: "Assistant chat bubble", type: "color" },
  "--bubble-bot-text": { label: "Assistant chat bubble text", type: "color" },
  "--font-body": { label: "Body font", type: "font" },
  "--font-display": { label: "Heading font", type: "font" }
};

// Every id here must match a real `data-editable="<id>"` attribute in
// public/index.html. maxLen is generous but bounded — these render as
// plain textContent (never innerHTML) on the client, same convention the
// rest of this app already uses for anything a user can type.
const ALLOWED_EDITABLE = {
  "hero-eyebrow": { label: "Eyebrow label above the title", maxLen: 80 },
  "hero-title": { label: "Main headline", maxLen: 120 },
  "hero-subtitle": { label: "Subheadline", maxLen: 300 },
  "home-section-label": { label: "\"Ask about…\" label", maxLen: 60 },
  "quick-action-sibling-label": { label: "Quick action: sibling conflict", maxLen: 60 },
  "quick-action-bedtime-label": { label: "Quick action: bedtime battles", maxLen: 60 },
  "quick-action-tantrums-label": { label: "Quick action: tantrums", maxLen: 60 },
  "quick-action-screen-time-label": { label: "Quick action: screen time", maxLen: 60 },
  "home-continue-btn": { label: "\"Continue chatting\" button", maxLen: 60 },
  "footer-heads-up-label": { label: "Footer \"Heads up:\" label", maxLen: 40 },
  "footer-disclaimer-text": { label: "Footer disclaimer sentence", maxLen: 300 }
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
    themeVars: Object.keys(ALLOWED_THEME_VARS).map((name) => ({
      name,
      label: ALLOWED_THEME_VARS[name].label,
      type: ALLOWED_THEME_VARS[name].type
    })),
    fonts: ALLOWED_FONTS,
    editableFields: Object.keys(ALLOWED_EDITABLE).map((id) => ({
      id,
      label: ALLOWED_EDITABLE[id].label,
      maxLen: ALLOWED_EDITABLE[id].maxLen
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
