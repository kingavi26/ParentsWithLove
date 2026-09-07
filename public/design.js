// Live "Design Mode" visual editor — a lightweight, Divi-style in-page
// editor for this app's real pages. Two jobs, kept in one file:
//
// 1) EVERY visitor's browser applies whatever theme/content/order an admin
//    has already saved (GET /api/design, no auth) — this part runs for
//    every parent, every time, so the live site actually reflects what
//    was designed, not just what admin.html shows.
// 2) ONLY a logged-in admin (checked via the existing GET /api/admin/status)
//    additionally gets a floating "Edit design" toggle that turns the dashed
//    [data-editable]/[data-reorder-id] regions already marked up in
//    index.html into an in-place editor: click text to retype it, drag a
//    card to reorder it, use the panel to repick colors/fonts. Every save
//    goes straight through the admin-only PUT/POST endpoints in
//    src/routes/design.js, so nothing here is trusted client-side — a
//    tampered request without a valid admin session is rejected server-side
//    regardless of what this script does.
(function () {
  "use strict";

  function j(url, opts) {
    return fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts)).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  var currentSettings = { theme: {}, content: {}, order: {} };
  var schema = { themeVars: [], fonts: [], editableFields: [], reorderGroups: {} };
  var designModeActive = false;

  // ---------------- apply saved overrides (runs for every visitor) ----------------

  function applyTheme(theme) {
    Object.keys(theme || {}).forEach(function (name) {
      document.documentElement.style.setProperty(name, theme[name]);
    });
  }

  function applyContent(content) {
    Object.keys(content || {}).forEach(function (id) {
      document.querySelectorAll('[data-editable="' + id + '"]').forEach(function (el) {
        el.textContent = content[id];
      });
    });
  }

  function applyOrder(order) {
    Object.keys(order || {}).forEach(function (group) {
      var container = document.querySelector('[data-reorder-group="' + group + '"]');
      if (!container) return;
      (order[group] || []).forEach(function (id) {
        var item = container.querySelector(':scope > [data-reorder-id="' + id + '"]');
        if (item) container.appendChild(item);
      });
    });
  }

  function applyAll() {
    applyTheme(currentSettings.theme);
    applyContent(currentSettings.content);
    applyOrder(currentSettings.order);
  }

  // ---------------- design mode: editable text ----------------

  function wireEditable(el) {
    el.addEventListener("focus", function () {
      el.dataset.designOriginal = el.textContent;
    });
    el.addEventListener("keydown", function (e) {
      // Every editable field here is a short single-line label — a plain
      // Enter would insert a stray line break instead of doing anything
      // useful, so treat it as "done editing" instead.
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("blur", function () {
      if (!designModeActive) return;
      var text = (el.textContent || "").trim();
      el.textContent = text; // normalize away any pasted formatting
      if (text === (el.dataset.designOriginal || "").trim()) return;

      var id = el.getAttribute("data-editable");
      setStatus("Saving “" + id + "”…");
      j("/api/design/content", { method: "PUT", body: JSON.stringify({ id: id, text: text }) }).then(function (result) {
        if (!result.ok) {
          setStatus((result.data && result.data.error) || "Couldn't save that change.", true);
          el.textContent = el.dataset.designOriginal || text;
          return;
        }
        currentSettings = result.data.settings;
        setStatus("Saved.");
      });
    });
  }

  // ---------------- design mode: drag-to-reorder ----------------

  function clearDragState(container) {
    container.querySelectorAll("[data-reorder-id]").forEach(function (el) {
      el.classList.remove("is-dragging", "is-drop-target");
    });
  }

  function wireReorderGroup(container) {
    var draggedId = null;

    container.addEventListener("dragstart", function (e) {
      if (!designModeActive) return;
      var item = e.target.closest("[data-reorder-id]");
      if (!item || item.parentElement !== container) return;
      // Don't hijack a drag gesture that actually started inside an
      // editable text field nested in this card — let normal text
      // selection/caret placement happen there instead.
      var editableAncestor = e.target.closest("[data-editable]");
      if (editableAncestor && editableAncestor !== item) {
        e.preventDefault();
        return;
      }
      draggedId = item.getAttribute("data-reorder-id");
      item.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
    });

    container.addEventListener("dragover", function (e) {
      if (!designModeActive || !draggedId) return;
      var item = e.target.closest("[data-reorder-id]");
      if (!item || item.parentElement !== container) return;
      e.preventDefault();
      container.querySelectorAll("[data-reorder-id]").forEach(function (el) {
        el.classList.toggle("is-drop-target", el === item && el.getAttribute("data-reorder-id") !== draggedId);
      });
    });

    container.addEventListener("drop", function (e) {
      if (!designModeActive || !draggedId) return;
      var target = e.target.closest("[data-reorder-id]");
      if (!target || target.parentElement !== container) return;
      e.preventDefault();

      var dragged = container.querySelector(':scope > [data-reorder-id="' + draggedId + '"]');
      if (dragged && dragged !== target) {
        container.insertBefore(dragged, target);
      }
      clearDragState(container);
      draggedId = null;

      var group = container.getAttribute("data-reorder-group");
      var order = Array.prototype.map.call(
        container.querySelectorAll(":scope > [data-reorder-id]"),
        function (el) { return el.getAttribute("data-reorder-id"); }
      );

      setStatus("Saving new order…");
      j("/api/design/order", { method: "PUT", body: JSON.stringify({ group: group, order: order }) }).then(function (result) {
        if (!result.ok) {
          setStatus((result.data && result.data.error) || "Couldn't save that order.", true);
          return;
        }
        currentSettings = result.data.settings;
        setStatus("Saved.");
      });
    });

    container.addEventListener("dragend", function () {
      clearDragState(container);
      draggedId = null;
    });
  }

  // While design mode is active, a click landing inside an editable field
  // or a draggable card/nav item must never trigger that element's normal
  // app behavior (sending a chat prompt, switching screens) — it should
  // only place a text caret or start a drag. Capturing the click on
  // `document` runs before app.js's own click listeners (which are
  // attached directly to those buttons in the bubble phase), so
  // stopPropagation() here reliably suppresses them without touching
  // app.js at all. Caret placement/focus for contenteditable already
  // happens on mousedown, before this click-level guard runs, so editing
  // itself is unaffected.
  document.addEventListener(
    "click",
    function (e) {
      if (!designModeActive) return;
      if (e.target.closest(".design-mode-panel, #design-mode-toggle-btn")) return;
      if (e.target.closest("[data-editable], [data-reorder-id]")) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // ---------------- design mode: on/off ----------------

  function setDesignModeActive(active) {
    designModeActive = active;
    document.body.classList.toggle("design-mode-active", active);

    document.querySelectorAll("[data-editable]").forEach(function (el) {
      el.setAttribute("contenteditable", active ? "true" : "false");
    });
    document.querySelectorAll("[data-reorder-group] > [data-reorder-id]").forEach(function (el) {
      el.draggable = active;
    });

    var toggleBtn = document.getElementById("design-mode-toggle-btn");
    var panel = document.getElementById("design-mode-panel");
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-active", active);
      toggleBtn.textContent = active ? "✓ Editing design" : "🎨 Edit design";
    }
    if (panel) panel.hidden = !active;
  }

  var statusEl = null;
  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.style.color = isError ? "var(--error)" : "";
  }

  // ---------------- panel: theme controls ----------------

  function currentThemeValue(name) {
    if (currentSettings.theme && currentSettings.theme[name] != null) return currentSettings.theme[name];
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function saveThemeVar(name, value) {
    document.documentElement.style.setProperty(name, value); // instant preview
    setStatus("Saving…");
    var vars = {};
    vars[name] = value;
    j("/api/design/theme", { method: "PUT", body: JSON.stringify({ vars: vars }) }).then(function (result) {
      if (!result.ok) {
        setStatus((result.data && result.data.error) || "Couldn't save that.", true);
        return;
      }
      currentSettings = result.data.settings;
      setStatus("Saved.");
    });
  }

  function buildThemeFieldRow(field) {
    var row = document.createElement("div");
    row.className = "design-field-row";

    var label = document.createElement("label");
    label.textContent = field.label;
    var labelId = "design-var-" + field.name.replace(/[^a-z0-9]+/gi, "-");
    label.setAttribute("for", labelId);
    row.appendChild(label);

    if (field.type === "color") {
      var input = document.createElement("input");
      input.type = "color";
      input.id = labelId;
      var current = currentThemeValue(field.name);
      input.value = /^#[0-9a-fA-F]{6}$/.test(current) ? current : "#000000";
      input.addEventListener("input", function () {
        document.documentElement.style.setProperty(field.name, input.value); // live preview while dragging
      });
      input.addEventListener("change", function () {
        saveThemeVar(field.name, input.value);
      });
      row.appendChild(input);
    } else if (field.type === "font") {
      var select = document.createElement("select");
      select.id = labelId;
      var current2 = currentThemeValue(field.name);
      schema.fonts.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.value;
        opt.textContent = f.label;
        if (f.value === current2) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener("change", function () {
        saveThemeVar(field.name, select.value);
      });
      row.appendChild(select);
    }

    return row;
  }

  // ---------------- panel: reset ----------------

  function buildResetControl() {
    var wrap = document.createElement("div");
    wrap.className = "design-panel-actions";

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "design-reset-btn";
    resetBtn.textContent = "Reset all design changes…";

    var confirmRow = document.createElement("div");
    confirmRow.hidden = true;
    confirmRow.style.marginTop = "0.5rem";
    confirmRow.innerHTML =
      '<div class="design-hint">This reverts colors, fonts, edited text, and layout order back to the defaults shipped in the code.</div>';

    var yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.className = "design-reset-btn";
    yesBtn.textContent = "Yes, reset everything";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginLeft = "0.4rem";

    confirmRow.appendChild(yesBtn);
    confirmRow.appendChild(cancelBtn);

    resetBtn.addEventListener("click", function () {
      confirmRow.hidden = false;
      resetBtn.hidden = true;
    });
    cancelBtn.addEventListener("click", function () {
      confirmRow.hidden = true;
      resetBtn.hidden = false;
    });
    yesBtn.addEventListener("click", function () {
      yesBtn.disabled = true;
      j("/api/design/reset", { method: "POST", body: JSON.stringify({ scope: "all" }) }).then(function (result) {
        if (!result.ok) {
          setStatus((result.data && result.data.error) || "Couldn't reset.", true);
          yesBtn.disabled = false;
          return;
        }
        location.reload();
      });
    });

    wrap.appendChild(resetBtn);
    wrap.appendChild(confirmRow);
    return wrap;
  }

  // ---------------- build the toggle + panel ----------------

  function buildDesignModeUi() {
    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.id = "design-mode-toggle-btn";
    toggleBtn.className = "design-mode-toggle";
    toggleBtn.textContent = "🎨 Edit design";
    toggleBtn.addEventListener("click", function () {
      setDesignModeActive(!designModeActive);
    });

    var panel = document.createElement("div");
    panel.id = "design-mode-panel";
    panel.className = "design-mode-panel";
    panel.hidden = true;

    var heading = document.createElement("h3");
    heading.textContent = "Design mode";
    panel.appendChild(heading);

    var hint = document.createElement("p");
    hint.className = "design-hint";
    hint.textContent = "Click any dashed text on the page to edit it. Drag a dashed card or nav item to reorder it. Colors and fonts here apply site-wide.";
    panel.appendChild(hint);

    schema.themeVars.forEach(function (field) {
      panel.appendChild(buildThemeFieldRow(field));
    });

    panel.appendChild(buildResetControl());

    statusEl = document.createElement("div");
    statusEl.className = "design-mode-status";
    panel.appendChild(statusEl);

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);
  }

  // ---------------- boot ----------------

  function initEditingHooks() {
    document.querySelectorAll("[data-editable]").forEach(wireEditable);
    document.querySelectorAll("[data-reorder-group]").forEach(wireReorderGroup);
  }

  j("/api/design").then(function (result) {
    if (result.ok) {
      currentSettings = result.data.settings || currentSettings;
      schema = result.data.schema || schema;
      applyAll();
    }

    j("/api/admin/status").then(function (statusResult) {
      if (!statusResult.ok || !statusResult.data.available || !statusResult.data.loggedIn) return;
      buildDesignModeUi();
      initEditingHooks();
    });
  });
})();
