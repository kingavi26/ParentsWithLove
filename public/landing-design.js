// Live "Design Mode" visual editor for the marketing/landing page
// (public/index.html) — sibling to public/design.js, which does the same
// job for the parent-facing app (public/app.html). Kept as a separate file
// hitting separate /api/landing-design/* endpoints on purpose, mirroring
// src/landing-design.js's independence from src/design.js.
//
// Two jobs, kept in one file:
// 1) EVERY visitor's browser applies whatever theme/content/order/visibility
//    an admin has already saved (GET /api/landing-design, no auth).
// 2) ONLY a logged-in admin (checked via GET /api/admin/status) additionally
//    gets a floating "Edit design" toggle that turns the dashed
//    [data-editable]/[data-reorder-id] regions already marked up in
//    index.html into an in-place editor, plus a "Sections" panel to hide/
//    show whole blocks. Every save goes through the admin-only endpoints in
//    src/routes/landing-design.js — nothing here is trusted client-side.
(function () {
  "use strict";

  function j(url, opts) {
    return fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts)).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  var currentSettings = { theme: {}, content: {}, order: {}, hidden: [] };
  var schema = { themeVars: [], fonts: [], editableFields: [], reorderGroups: {}, hideableSections: [] };
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
        var attr = el.getAttribute("data-editable-attr");
        if (attr) {
          el.setAttribute(attr, content[id]);
        } else {
          el.textContent = content[id];
        }
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

  function applyVisibility(hidden) {
    var hiddenSet = {};
    (hidden || []).forEach(function (id) { hiddenSet[id] = true; });
    document.querySelectorAll('[data-reorder-group="landing-sections"] > [data-reorder-id]').forEach(function (el) {
      var id = el.getAttribute("data-reorder-id");
      el.hidden = Boolean(hiddenSet[id]);
    });
  }

  function applyAll() {
    applyTheme(currentSettings.theme);
    applyContent(currentSettings.content);
    applyOrder(currentSettings.order);
    applyVisibility(currentSettings.hidden);
  }

  // ---------------- design mode: editable text ----------------

  function wireEditable(el) {
    el.addEventListener("focus", function () {
      el.dataset.designOriginal = el.textContent;
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("blur", function () {
      if (!designModeActive) return;
      var text = (el.textContent || "").trim();
      el.textContent = text;
      if (text === (el.dataset.designOriginal || "").trim()) return;

      var id = el.getAttribute("data-editable");
      setStatus("Saving “" + id + "”…");
      j("/api/landing-design/content", { method: "PUT", body: JSON.stringify({ id: id, text: text }) }).then(function (result) {
        if (!result.ok) {
          setStatus((result.data && result.data.error) || "Couldn't save that change.", true);
          el.textContent = el.dataset.designOriginal || text;
          return;
        }
        currentSettings = result.data.settings;
        applyContent(currentSettings.content); // keep every other instance of this id in sync
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
      j("/api/landing-design/order", { method: "PUT", body: JSON.stringify({ group: group, order: order }) }).then(function (result) {
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

    document.querySelectorAll("[data-editable]:not([data-editable-attr])").forEach(function (el) {
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
    document.documentElement.style.setProperty(name, value);
    setStatus("Saving…");
    var vars = {};
    vars[name] = value;
    j("/api/landing-design/theme", { method: "PUT", body: JSON.stringify({ vars: vars }) }).then(function (result) {
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
        document.documentElement.style.setProperty(field.name, input.value);
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
    } else if (field.type === "range") {
      var wrap = document.createElement("span");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "0.4rem";

      var range = document.createElement("input");
      range.type = "range";
      range.id = labelId;
      range.min = field.min;
      range.max = field.max;
      range.step = field.step;
      var currentRaw = currentThemeValue(field.name);
      var currentNum = parseFloat(String(currentRaw).replace(field.unit || "", ""));
      range.value = Number.isFinite(currentNum) ? currentNum : field.min;

      var readout = document.createElement("span");
      readout.style.fontSize = "0.72rem";
      readout.style.color = "var(--muted)";
      readout.style.minWidth = "2.4rem";
      readout.style.textAlign = "right";
      readout.textContent = range.value + field.unit;

      range.addEventListener("input", function () {
        readout.textContent = range.value + field.unit;
        document.documentElement.style.setProperty(field.name, range.value + field.unit);
      });
      range.addEventListener("change", function () {
        saveThemeVar(field.name, range.value + field.unit);
      });

      wrap.appendChild(range);
      wrap.appendChild(readout);
      row.appendChild(wrap);
    }

    return row;
  }

  // ---------------- panel: sections (show/hide) ----------------

  function saveVisibility(id, visible, onDone) {
    setStatus("Saving…");
    j("/api/landing-design/visibility", { method: "PUT", body: JSON.stringify({ id: id, visible: visible }) }).then(function (result) {
      if (!result.ok) {
        setStatus((result.data && result.data.error) || "Couldn't save that.", true);
        onDone(false);
        return;
      }
      currentSettings = result.data.settings;
      applyVisibility(currentSettings.hidden);
      setStatus("Saved.");
      onDone(true);
    });
  }

  function buildSectionToggleRow(section) {
    var row = document.createElement("div");
    row.className = "design-field-row";

    var label = document.createElement("label");
    label.textContent = section.label;
    var inputId = "design-section-" + section.id;
    label.setAttribute("for", inputId);
    row.appendChild(label);

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = inputId;
    checkbox.checked = (currentSettings.hidden || []).indexOf(section.id) === -1;
    checkbox.addEventListener("change", function () {
      var wantVisible = checkbox.checked;
      checkbox.disabled = true;
      saveVisibility(section.id, wantVisible, function (ok) {
        checkbox.disabled = false;
        if (!ok) checkbox.checked = !wantVisible;
      });
    });
    row.appendChild(checkbox);
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
      '<div class="design-hint">This reverts colors, fonts, edited text, section order, and section visibility back to the defaults shipped in the code.</div>';

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
      j("/api/landing-design/reset", { method: "POST", body: JSON.stringify({ scope: "all" }) }).then(function (result) {
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
    hint.textContent = "Click any dashed text to edit it. Drag a dashed card or section to reorder it. Use Sections below to hide a whole block.";
    panel.appendChild(hint);

    var themeGroups = [];
    schema.themeVars.forEach(function (field) {
      var group = field.group || "Theme";
      if (themeGroups.indexOf(group) === -1) themeGroups.push(group);
    });
    themeGroups.forEach(function (group) {
      var sectionLabel = document.createElement("div");
      sectionLabel.className = "design-section-label";
      sectionLabel.textContent = group;
      panel.appendChild(sectionLabel);
      schema.themeVars
        .filter(function (f) { return (f.group || "Theme") === group; })
        .forEach(function (field) { panel.appendChild(buildThemeFieldRow(field)); });
    });

    if (schema.hideableSections && schema.hideableSections.length) {
      var sectionsLabel = document.createElement("div");
      sectionsLabel.className = "design-section-label";
      sectionsLabel.textContent = "Sections";
      panel.appendChild(sectionsLabel);
      schema.hideableSections.forEach(function (section) { panel.appendChild(buildSectionToggleRow(section)); });
    }

    panel.appendChild(buildResetControl());

    statusEl = document.createElement("div");
    statusEl.className = "design-mode-status";
    panel.appendChild(statusEl);

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);
  }

  // ---------------- boot ----------------

  function initEditingHooks() {
    document.querySelectorAll("[data-editable]:not([data-editable-attr])").forEach(wireEditable);
    document.querySelectorAll("[data-reorder-group]").forEach(wireReorderGroup);
  }

  j("/api/landing-design").then(function (result) {
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
