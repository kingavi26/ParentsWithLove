(function () {
  "use strict";

  var notConfiguredBanner = document.getElementById("admin-not-configured");
  var loginScreen = document.getElementById("admin-login-screen");
  var loginForm = document.getElementById("admin-login-form");
  var loginError = document.getElementById("admin-login-error");
  var loginSubmit = document.getElementById("admin-login-submit");
  var emailInput = document.getElementById("admin-email");
  var passwordInput = document.getElementById("admin-password");

  var dashboard = document.getElementById("admin-dashboard");
  var logoutBtn = document.getElementById("admin-logout-btn");
  var tabs = document.querySelectorAll(".admin-tab");
  var panels = {
    overview: document.getElementById("admin-panel-overview"),
    users: document.getElementById("admin-panel-users"),
    reviews: document.getElementById("admin-panel-reviews"),
    prompt: document.getElementById("admin-panel-prompt")
  };

  var statsEl = document.getElementById("admin-stats");
  var recentSignupsEl = document.getElementById("admin-recent-signups");

  var usersBody = document.getElementById("admin-users-body");

  var reviewsList = document.getElementById("admin-reviews-list");
  var reviewsClearFilterBtn = document.getElementById("admin-reviews-clear-filter");

  var promptBadge = document.getElementById("admin-prompt-badge");
  var promptTextarea = document.getElementById("admin-prompt-textarea");
  var promptError = document.getElementById("admin-prompt-error");
  var promptSuccess = document.getElementById("admin-prompt-success");
  var promptSaveBtn = document.getElementById("admin-prompt-save-btn");
  var promptResetBtn = document.getElementById("admin-prompt-reset-btn");
  var promptResetConfirm = document.getElementById("admin-prompt-reset-confirm");
  var promptResetConfirmBtn = document.getElementById("admin-prompt-reset-confirm-btn");

  var userModal = document.getElementById("admin-user-modal");
  var userModalEmail = document.getElementById("admin-user-modal-email");
  var userModalBody = document.getElementById("admin-user-modal-body");
  var userModalCloseBtn = document.getElementById("admin-user-modal-close-btn");

  var deleteModal = document.getElementById("admin-delete-modal");
  var deleteModalCopy = document.getElementById("admin-delete-modal-copy");
  var deleteModalError = document.getElementById("admin-delete-modal-error");
  var deleteModalConfirmBtn = document.getElementById("admin-delete-modal-confirm-btn");
  var deleteModalCloseBtn = document.getElementById("admin-delete-modal-close-btn");

  var reviewsFilterUserId = null;
  var pendingDeleteUserId = null;

  function j(url, opts) {
    return fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts)).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDate(stored) {
    if (!stored) return "—";
    var d = new Date(stored.replace(" ", "T") + (stored.indexOf("Z") === -1 ? "Z" : ""));
    if (isNaN(d.getTime())) return stored;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ---------------- boot / login ----------------

  function boot() {
    j("/api/admin/status").then(function (result) {
      if (!result.data.available) {
        notConfiguredBanner.hidden = false;
        return;
      }
      if (result.data.loggedIn) {
        showDashboard();
      } else {
        loginScreen.hidden = false;
      }
    });
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.textContent = "";
    loginError.classList.remove("visible");
    loginSubmit.disabled = true;

    j("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
    }).then(function (result) {
      loginSubmit.disabled = false;
      if (!result.ok) {
        loginError.textContent = result.data.error || "Something went wrong.";
        loginError.classList.add("visible");
        return;
      }
      passwordInput.value = "";
      showDashboard();
    });
  });

  logoutBtn.addEventListener("click", function () {
    j("/api/admin/logout", { method: "POST" }).finally(function () {
      dashboard.hidden = true;
      loginScreen.hidden = false;
    });
  });

  function showDashboard() {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    loadOverview();
  }

  // ---------------- tabs ----------------

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
      Object.keys(panels).forEach(function (key) { panels[key].hidden = key !== name; });
      if (name === "overview") loadOverview();
      if (name === "users") loadUsers();
      if (name === "reviews") loadReviews(reviewsFilterUserId);
      if (name === "prompt") loadPrompt();
    });
  });

  function switchToTab(name) {
    tabs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-tab") === name); });
    Object.keys(panels).forEach(function (key) { panels[key].hidden = key !== name; });
  }

  // ---------------- overview ----------------

  function statCard(label, value) {
    return '<div class="admin-stat-card"><div class="admin-stat-value">' + escapeHtml(value) +
      '</div><div class="admin-stat-label">' + escapeHtml(label) + "</div></div>";
  }

  function loadOverview() {
    j("/api/admin/overview").then(function (result) {
      if (!result.ok) return;
      var d = result.data;
      statsEl.innerHTML =
        statCard("Total users", d.totalUsers) +
        statCard("Google-linked", d.withGoogle) +
        statCard("Facebook-linked", d.withFacebook) +
        statCard("Password only", d.passwordOnly) +
        statCard("Suspended", d.suspended) +
        statCard("Children tracked", d.totalChildren) +
        statCard("Self-reviews", d.totalReviews) +
        statCard("Avg review score", d.avgOverallScore != null ? d.avgOverallScore + "/10" : "—");

      if (d.recentSignups && d.recentSignups.length) {
        recentSignupsEl.innerHTML = d.recentSignups
          .map(function (u) {
            return '<div class="admin-signup-row"><span>' + escapeHtml(u.email) + "</span><span class=\"admin-muted\">" +
              formatDate(u.created_at) + "</span></div>";
          })
          .join("");
      } else {
        recentSignupsEl.innerHTML = '<div class="memory-empty">No signups yet</div>';
      }
    });
  }

  // ---------------- users ----------------

  function loginMethods(u) {
    var methods = [];
    if (u.hasPassword) methods.push("Password");
    if (u.hasGoogle) methods.push("Google");
    if (u.hasFacebook) methods.push("Facebook");
    return methods.join(", ") || "—";
  }

  function loadUsers() {
    j("/api/admin/users").then(function (result) {
      if (!result.ok) return;
      usersBody.innerHTML = result.data.users
        .map(function (u) {
          return (
            "<tr>" +
            "<td>" + escapeHtml(u.email) + "</td>" +
            "<td>" + formatDate(u.createdAt) + "</td>" +
            "<td>" + escapeHtml(loginMethods(u)) + "</td>" +
            "<td>" + u.childrenCount + "</td>" +
            "<td>" + formatDate(u.lastConversationAt) + "</td>" +
            "<td>" + (u.suspended ? '<span class="admin-badge admin-badge-warn">Suspended</span>' : '<span class="admin-badge admin-badge-ok">Active</span>') + "</td>" +
            '<td class="admin-row-actions">' +
            '<button type="button" class="admin-link-btn" data-action="view" data-id="' + u.id + '">View</button>' +
            '<button type="button" class="admin-link-btn" data-action="suspend" data-id="' + u.id + '" data-suspended="' + u.suspended + '">' +
            (u.suspended ? "Unsuspend" : "Suspend") +
            "</button>" +
            '<button type="button" class="admin-link-btn admin-link-btn-danger" data-action="delete" data-id="' + u.id + '" data-email="' + escapeHtml(u.email) + '">Delete</button>' +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    });
  }

  usersBody.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var id = Number(btn.getAttribute("data-id"));
    var action = btn.getAttribute("data-action");

    if (action === "view") {
      openUserModal(id);
    } else if (action === "suspend") {
      var currentlySuspended = btn.getAttribute("data-suspended") === "true";
      j("/api/admin/users/" + id, {
        method: "PATCH",
        body: JSON.stringify({ suspended: !currentlySuspended })
      }).then(function () {
        loadUsers();
      });
    } else if (action === "delete") {
      openDeleteModal(id, btn.getAttribute("data-email"));
    }
  });

  // ---------------- user detail modal ----------------

  function renderUserDetail(u) {
    var childrenHtml = u.children && u.children.length
      ? u.children.map(function (c) { return '<div class="child-row">' + escapeHtml(c.name || "Unnamed child") + (c.age != null ? " — age " + c.age : "") + "</div>"; }).join("")
      : '<div class="memory-empty">None yet</div>';

    var topicsHtml = u.topicsDiscussed && u.topicsDiscussed.length
      ? '<div class="chip-row">' + u.topicsDiscussed.map(function (t) {
          var topic = typeof t === "string" ? t : t.topic;
          var when = typeof t === "object" && t && t.lastDiscussedAt ? " (" + formatDate(t.lastDiscussedAt) + ")" : "";
          return '<span class="chip">' + escapeHtml(topic) + escapeHtml(when) + "</span>";
        }).join("") + "</div>"
      : '<div class="memory-empty">None yet</div>';

    var notesHtml = u.notes && u.notes.length
      ? u.notes.map(function (n) {
          var text = typeof n === "string" ? n : n.text;
          var when = typeof n === "object" && n && n.date ? " — " + formatDate(n.date) : "";
          return '<div class="note-item">' + escapeHtml(text) + escapeHtml(when) + "</div>";
        }).join("")
      : '<div class="memory-empty">None yet</div>';

    var reviewsHtml = u.reviews && u.reviews.length
      ? u.reviews.map(function (r) {
          return '<button type="button" class="admin-review-link" data-review-user-id="' + u.id + '">' +
            (r.overallScore != null ? r.overallScore + "/10" : "—") + " — " + formatDate(r.createdAt) +
            "</button>";
        }).join("")
      : '<div class="memory-empty">No self-reviews yet</div>';

    return (
      '<div class="modal-section"><div class="modal-label">Account</div>' +
      '<div class="modal-static">Joined ' + formatDate(u.createdAt) + " &middot; " + escapeHtml(loginMethods(u)) +
      (u.suspended ? ' &middot; <span class="admin-badge admin-badge-warn">Suspended</span>' : "") +
      "</div></div>" +
      '<div class="modal-section"><div class="modal-label">Children</div>' + childrenHtml + "</div>" +
      '<div class="modal-section"><div class="modal-label">Topics discussed</div>' + topicsHtml + "</div>" +
      '<div class="modal-section"><div class="modal-label">Notes</div>' + notesHtml + "</div>" +
      '<div class="modal-section"><div class="modal-label">Self-reviews</div><div class="admin-review-links">' + reviewsHtml + "</div></div>"
    );
  }

  function openUserModal(id) {
    userModalEmail.textContent = "";
    userModalBody.innerHTML = '<div class="review-loading">Loading&hellip;</div>';
    userModal.hidden = false;
    j("/api/admin/users/" + id).then(function (result) {
      if (!result.ok) {
        userModalBody.innerHTML = '<div class="review-error">' + escapeHtml(result.data.error || "Couldn't load this account.") + "</div>";
        return;
      }
      userModalEmail.textContent = result.data.email;
      userModalBody.innerHTML = renderUserDetail(result.data);
    });
  }

  userModalBody.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-review-user-id]");
    if (!btn) return;
    var id = Number(btn.getAttribute("data-review-user-id"));
    userModal.hidden = true;
    switchToTab("reviews");
    loadReviews(id);
  });

  userModalCloseBtn.addEventListener("click", function () { userModal.hidden = true; });
  userModal.addEventListener("click", function (e) { if (e.target === userModal) userModal.hidden = true; });

  // ---------------- delete modal ----------------

  function openDeleteModal(id, email) {
    pendingDeleteUserId = id;
    deleteModalCopy.textContent =
      "This permanently deletes " + email + ", their children's info, and everything the assistant remembers about them. This can't be undone.";
    deleteModalError.textContent = "";
    deleteModalError.classList.remove("visible");
    deleteModal.hidden = false;
  }

  deleteModalCloseBtn.addEventListener("click", function () { deleteModal.hidden = true; });
  deleteModal.addEventListener("click", function (e) { if (e.target === deleteModal) deleteModal.hidden = true; });

  deleteModalConfirmBtn.addEventListener("click", function () {
    if (pendingDeleteUserId == null) return;
    deleteModalConfirmBtn.disabled = true;
    j("/api/admin/users/" + pendingDeleteUserId, {
      method: "DELETE",
      body: JSON.stringify({ confirm: true })
    }).then(function (result) {
      deleteModalConfirmBtn.disabled = false;
      if (!result.ok) {
        deleteModalError.textContent = result.data.error || "Something went wrong.";
        deleteModalError.classList.add("visible");
        return;
      }
      deleteModal.hidden = true;
      pendingDeleteUserId = null;
      loadUsers();
    });
  });

  // ---------------- reviews ----------------

  var DIMENSION_LABELS = {
    loveAndSafety: "Love & safety",
    understandingBeforeGuiding: "Understanding first",
    regulationTiming: "Regulation timing",
    validation: "Validation",
    boundaryWarmth: "Boundary warmth",
    developmentalAppropriateness: "Developmentally appropriate",
    researchGrounding: "Research grounding"
  };

  function renderReviewList(items) {
    if (!items || !items.length) return '<div class="review-empty">None noted</div>';
    return '<ul class="review-list">' + items.map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("") + "</ul>";
  }

  function loadReviews(userId) {
    reviewsFilterUserId = userId || null;
    reviewsClearFilterBtn.hidden = !reviewsFilterUserId;
    var url = "/api/admin/reviews" + (reviewsFilterUserId ? "?userId=" + reviewsFilterUserId : "");

    reviewsList.innerHTML = '<div class="review-loading">Loading&hellip;</div>';
    j(url).then(function (result) {
      if (!result.ok) {
        reviewsList.innerHTML = '<div class="review-error">Couldn\'t load reviews.</div>';
        return;
      }
      if (!result.data.reviews.length) {
        reviewsList.innerHTML = '<div class="memory-empty">No self-reviews yet.</div>';
        return;
      }
      reviewsList.innerHTML = result.data.reviews.map(renderReviewCard).join("");
    });
  }

  function renderReviewCard(r) {
    var dims = r.dimensionScores || {};
    var dimChips = Object.keys(DIMENSION_LABELS)
      .filter(function (key) { return dims[key] != null; })
      .map(function (key) { return '<span class="review-dim-chip">' + DIMENSION_LABELS[key] + ": " + dims[key] + "/10</span>"; })
      .join("");

    return (
      '<div class="admin-review-card">' +
      '<button type="button" class="admin-review-card-head" data-toggle-review="' + r.id + '">' +
      '<span><strong>' + (r.overallScore != null ? r.overallScore + "/10" : "—") + "</strong> &mdash; " + escapeHtml(r.userEmail || "unknown") + "</span>" +
      '<span class="admin-muted">' + formatDate(r.createdAt) + "</span>" +
      "</button>" +
      '<div class="admin-review-card-body" id="admin-review-body-' + r.id + '" hidden>' +
      (dimChips ? '<div class="review-dims">' + dimChips + "</div>" : "") +
      '<div class="review-section"><div class="review-section-label">Strengths</div>' + renderReviewList(r.strengths) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Concerns</div>' + renderReviewList(r.concerns) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Missed opportunities</div>' + renderReviewList(r.missedOpportunities) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Suggested prompt changes</div>' + renderReviewList(r.suggestedPromptChanges) + "</div>" +
      "</div></div>"
    );
  }

  reviewsList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-toggle-review]");
    if (!btn) return;
    var body = document.getElementById("admin-review-body-" + btn.getAttribute("data-toggle-review"));
    if (body) body.hidden = !body.hidden;
  });

  reviewsClearFilterBtn.addEventListener("click", function () { loadReviews(null); });

  // ---------------- prompt ----------------

  function loadPrompt() {
    promptError.textContent = "";
    promptError.classList.remove("visible");
    promptSuccess.hidden = true;
    promptResetConfirm.hidden = true;

    j("/api/admin/prompt").then(function (result) {
      if (!result.ok) return;
      promptTextarea.value = result.data.current;
      promptBadge.textContent = result.data.isCustomized ? "Customized" : "Default";
      promptBadge.className = "admin-badge " + (result.data.isCustomized ? "admin-badge-warn" : "admin-badge-ok");
    });
  }

  promptSaveBtn.addEventListener("click", function () {
    promptError.textContent = "";
    promptError.classList.remove("visible");
    promptSuccess.hidden = true;
    promptSaveBtn.disabled = true;

    j("/api/admin/prompt", { method: "POST", body: JSON.stringify({ text: promptTextarea.value }) }).then(function (result) {
      promptSaveBtn.disabled = false;
      if (!result.ok) {
        promptError.textContent = result.data.error || "Something went wrong.";
        promptError.classList.add("visible");
        return;
      }
      promptSuccess.hidden = false;
      promptBadge.textContent = "Customized";
      promptBadge.className = "admin-badge admin-badge-warn";
    });
  });

  promptResetBtn.addEventListener("click", function () {
    promptResetConfirm.hidden = false;
  });

  promptResetConfirmBtn.addEventListener("click", function () {
    promptResetConfirmBtn.disabled = true;
    j("/api/admin/prompt/reset", { method: "POST" }).then(function (result) {
      promptResetConfirmBtn.disabled = false;
      if (!result.ok) return;
      promptTextarea.value = result.data.current;
      promptBadge.textContent = "Default";
      promptBadge.className = "admin-badge admin-badge-ok";
      promptResetConfirm.hidden = true;
      promptSuccess.hidden = false;
    });
  });

  // ---------------- boot ----------------

  boot();
})();
