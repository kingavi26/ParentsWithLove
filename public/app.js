(function () {
  "use strict";

  var authScreen = document.getElementById("auth-screen");
  var appScreen = document.getElementById("app-screen");
  var authForm = document.getElementById("auth-form");
  var authError = document.getElementById("auth-error");
  var authSubmit = document.getElementById("auth-submit");
  var authTabs = document.querySelectorAll(".auth-tab");
  var socialAuthWrap = document.getElementById("social-auth");
  var googleLoginBtn = document.getElementById("google-login-btn");
  var facebookLoginBtn = document.getElementById("facebook-login-btn");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");

  var demoBanner = document.getElementById("demo-banner");
  var accountEmail = document.getElementById("account-email");
  var logoutBtn = document.getElementById("logout-btn");
  var chatSubtitle = document.getElementById("chat-subtitle");

  var accountModal = document.getElementById("account-modal");
  var accountModalCloseBtn = document.getElementById("account-modal-close-btn");
  var accountModalEmail = document.getElementById("account-modal-email");
  var accountPasswordForm = document.getElementById("account-password-form");
  var accountPasswordHeading = document.getElementById("account-password-heading");
  var accountPasswordError = document.getElementById("account-password-error");
  var accountPasswordSuccess = document.getElementById("account-password-success");
  var currentPasswordField = document.getElementById("current-password-field");
  var currentPasswordInput = document.getElementById("current-password");
  var newPasswordLabel = document.getElementById("new-password-label");
  var newPasswordInput = document.getElementById("new-password");
  var accountPasswordSubmit = document.getElementById("account-password-submit");
  var accountChildrenError = document.getElementById("account-children-error");
  var accountChildrenList = document.getElementById("account-children-list");
  var accountTopicsError = document.getElementById("account-topics-error");
  var accountTopicsList = document.getElementById("account-topics-list");
  var accountNotesList = document.getElementById("account-notes-list");
  var exportDataBtn = document.getElementById("export-data-btn");
  var accountDeleteError = document.getElementById("account-delete-error");
  var showDeleteConfirmBtn = document.getElementById("show-delete-confirm-btn");
  var deleteConfirmBlock = document.getElementById("delete-confirm-block");
  var deleteConfirmEmailHint = document.getElementById("delete-confirm-email-hint");
  var deleteConfirmEmailInput = document.getElementById("delete-confirm-email");
  var confirmDeleteBtn = document.getElementById("confirm-delete-btn");

  var chatLog = document.getElementById("chat-log");
  var chatForm = document.getElementById("chat-form");
  var chatInput = document.getElementById("chat-input");
  var chatSend = document.getElementById("chat-send");

  // ---------------- app nav / screens ----------------
  var navItems = document.querySelectorAll(".nav-item");
  var screenHome = document.getElementById("screen-home");
  var screenChat = document.getElementById("screen-chat");
  var screenMemory = document.getElementById("screen-memory");
  var homeGreeting = document.getElementById("home-greeting");
  var homeKids = document.getElementById("home-kids");
  var homeContinueBtn = document.getElementById("home-continue-btn");
  var quickActionCards = document.querySelectorAll(".quick-action-card");

  var memoryLastActive = document.getElementById("memory-last-active");
  var memoryChildren = document.getElementById("memory-children");
  var memoryTopics = document.getElementById("memory-topics");
  var memoryNotes = document.getElementById("memory-notes");

  var rateSessionBtn = document.getElementById("rate-session-btn");
  var reviewPanel = document.getElementById("review-panel");
  var reviewBody = document.getElementById("review-body");
  var reviewCloseBtn = document.getElementById("review-close-btn");

  var voiceToggleBtn = document.getElementById("voice-toggle-btn");
  var micBtn = document.getElementById("mic-btn");
  var voicePlayer = document.getElementById("voice-player");

  var authMode = "login"; // or "signup"
  var conversation = []; // { role: 'user' | 'assistant', content: string } — this browser tab's session only
  var currentEmail = "";
  var accountHasPassword = false;
  var latestChildren = []; // kept in sync with renderMemory(), used to fill the account modal's edit list
  var latestTopics = []; // same idea, for the account modal's "Topics discussed" delete list
  var latestNotes = []; // same idea, for the account modal's "Notes" delete list

  var voiceAvailable = false; // set from /api/status — needs a real OpenAI key on the server
  var micSupported = Boolean(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var readAloudEnabled = false;
  try {
    readAloudEnabled = window.localStorage.getItem("pwl7_read_aloud") === "1";
  } catch (e) {
    // localStorage can throw in locked-down browser contexts — read-aloud just stays off.
  }
  var mediaRecorder = null;
  var recordedChunks = [];

  // ---------------- auth screen ----------------

  authTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      authMode = tab.getAttribute("data-mode");
      authTabs.forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      authSubmit.textContent = authMode === "login" ? "Log in" : "Sign up";
      passwordInput.setAttribute("autocomplete", authMode === "login" ? "current-password" : "new-password");
      hideAuthError();
    });
  });

  function showAuthError(message) {
    authError.textContent = message;
    authError.classList.add("visible");
  }

  function hideAuthError() {
    authError.classList.remove("visible");
  }

  authForm.addEventListener("submit", function (e) {
    e.preventDefault();
    hideAuthError();
    authSubmit.disabled = true;

    var endpoint = authMode === "login" ? "/api/login" : "/api/signup";

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        authSubmit.disabled = false;
        if (!result.ok) {
          showAuthError(result.data.error || "Something went wrong. Please try again.");
          return;
        }
        enterApp();
      })
      .catch(function () {
        authSubmit.disabled = false;
        showAuthError("Couldn't reach the server. Please try again.");
      });
  });

  logoutBtn.addEventListener("click", function () {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      conversation = [];
      chatLog.innerHTML = "";
      appScreen.hidden = true;
      authScreen.hidden = false;
      passwordInput.value = "";
      accountModal.hidden = true;
      stopRecording();
      voicePlayer.pause();
    });
  });

  // ---------------- demo banner ----------------

  fetch("/api/status")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.demoMode) {
        demoBanner.hidden = false;
        demoBanner.textContent =
          "Running in demo mode: replies are scripted, not from a real AI, until an OpenAI API key is configured on the server. Login and memory are fully real.";
        chatSubtitle.textContent = "Demo mode — scripted answers for now";
      } else {
        chatSubtitle.textContent = "Connected to OpenAI";
      }

      voiceAvailable = Boolean(data.voiceAvailable);
      if (voiceAvailable) {
        voiceToggleBtn.hidden = false;
        updateVoiceToggleUI();
        if (micSupported) micBtn.hidden = false;
      }

      var googleOn = Boolean(data.googleLoginAvailable);
      var facebookOn = Boolean(data.facebookLoginAvailable);
      if (googleOn) googleLoginBtn.hidden = false;
      if (facebookOn) facebookLoginBtn.hidden = false;
      if (googleOn || facebookOn) socialAuthWrap.hidden = false;
    })
    .catch(function () {});

  // A social-login redirect (or an expired/cancelled attempt) comes back to
  // "/" with ?authError=... rather than a JSON error, since the browser
  // itself navigated here rather than app.js making the request.
  (function showSocialAuthErrorFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var message = params.get("authError");
    if (message) {
      showAuthError(message);
      params.delete("authError");
      var rest = params.toString();
      var cleanUrl = window.location.pathname + (rest ? "?" + rest : "");
      window.history.replaceState({}, "", cleanUrl);
    }
  })();

  // ---------------- app screen: nav + screens ----------------
  // The app is a real shell with distinct screens (Home / Chat / Memory),
  // switched by showScreen(), rather than one long page with everything
  // stacked. "Settings" in the nav opens the existing account modal instead
  // of switching screens, so whichever screen was behind it stays active
  // when the modal closes.

  function showScreen(name) {
    screenHome.hidden = name !== "home";
    screenChat.hidden = name !== "chat";
    screenMemory.hidden = name !== "memory";
    navItems.forEach(function (item) {
      var screen = item.getAttribute("data-screen");
      if (screen === "settings") return;
      item.classList.toggle("active", screen === name);
    });
  }

  navItems.forEach(function (item) {
    item.addEventListener("click", function () {
      var screen = item.getAttribute("data-screen");
      if (screen === "settings") {
        openAccountModal();
        return;
      }
      showScreen(screen);
    });
  });

  function goToChatWithPrompt(text) {
    showScreen("chat");
    if (text) {
      chatInput.value = text;
      chatInput.focus();
    }
  }

  quickActionCards.forEach(function (card) {
    card.addEventListener("click", function () {
      goToChatWithPrompt(card.getAttribute("data-prompt"));
    });
  });

  homeContinueBtn.addEventListener("click", function () {
    showScreen("chat");
  });

  function renderHome(data) {
    var hasHistory = (data.children && data.children.length) || (data.topics_discussed && data.topics_discussed.length) || (data.notes && data.notes.length);
    var lastDate = formatShortDate(data.last_conversation_at);
    homeGreeting.textContent = hasHistory
      ? "Welcome back!" + (lastDate ? " We last talked on " + lastDate + "." : "")
      : "Hi! Let's talk about your kids.";

    if (data.children && data.children.length) {
      homeKids.innerHTML = "";
      data.children.forEach(function (c) {
        var pill = document.createElement("span");
        pill.className = "kid-pill";
        pill.textContent = (c.name || "Unnamed child") + (c.age != null ? " · " + c.age : "");
        homeKids.appendChild(pill);
      });
      homeKids.hidden = false;
    } else {
      homeKids.hidden = true;
    }
  }

  // ---------------- app screen ----------------

  function enterApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    showScreen("home");
    conversation = [];
    chatLog.innerHTML = "";
    reviewPanel.hidden = true;
    reviewBody.innerHTML = "";
    accountModal.hidden = true;
    stopRecording();
    voicePlayer.pause();
    refreshMe();
  }

  function refreshMe() {
    fetch("/api/me")
      .then(function (res) {
        if (!res.ok) throw new Error("not logged in");
        return res.json();
      })
      .then(function (data) {
        authScreen.hidden = true;
        appScreen.hidden = false;
        accountEmail.textContent = data.email;
        currentEmail = data.email;
        accountHasPassword = Boolean(data.hasPassword);
        renderHome(data);
        renderMemory(data);
        if (!accountModal.hidden) {
          renderAccountChildrenList();
          renderAccountTopicsList();
          renderAccountNotesList();
        }
        if (chatLog.children.length === 0) {
          greet(data);
        }
      })
      .catch(function () {
        appScreen.hidden = true;
        authScreen.hidden = false;
      });
  }

  // Accepts either "YYYY-MM-DD" or a SQLite "YYYY-MM-DD HH:MM:SS" timestamp.
  // Returns null (rather than "Invalid Date") for anything missing/bad.
  function formatShortDate(stored) {
    if (!stored) return null;
    var d = new Date(stored.slice(0, 10) + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function greet(data) {
    var hasHistory = data.children.length || data.topics_discussed.length || data.notes.length;
    var lastDate = formatShortDate(data.last_conversation_at);
    var text = hasHistory
      ? "Welcome back!" +
        (lastDate ? " We last talked on " + lastDate + "." : "") +
        " I remember a bit about your family already — feel free to keep going, or ask something new."
      : "Hi! I'm the parenting help chatbot. Tell me what's going on, or ask about tantrums, screen time, bedtime, or sibling conflict.";
    addMessage(text, "bot");
  }

  function renderMemory(data) {
    if (memoryLastActive) {
      var lastActiveDate = formatShortDate(data.last_conversation_at);
      if (lastActiveDate) {
        memoryLastActive.hidden = false;
        memoryLastActive.textContent = "Last conversation: " + lastActiveDate;
      } else {
        memoryLastActive.hidden = true;
      }
    }

    latestChildren = data.children || [];
    latestTopics = data.topics_discussed || [];
    latestNotes = data.notes || [];

    if (data.children && data.children.length) {
      memoryChildren.innerHTML = "";
      data.children.forEach(function (c) {
        var pill = document.createElement("span");
        pill.className = "kid-pill";
        pill.textContent = (c.name || "Unnamed child") + (c.age != null ? " · " + c.age : "");
        memoryChildren.appendChild(pill);
      });
    } else {
      memoryChildren.innerHTML = '<div class="memory-empty">Nothing yet</div>';
    }

    renderCollapsiblePins(memoryTopics, data.topics_discussed, function (t) {
      var pin = document.createElement("div");
      pin.className = "pin-note";
      var topic = typeof t === "string" ? t : t.topic;
      var when = typeof t === "object" && t ? formatShortDate(t.lastDiscussedAt) : null;
      pin.textContent = when ? topic + " — last talked about " + when : topic;
      return pin;
    });

    renderCollapsiblePins(memoryNotes, data.notes, function (n) {
      var pin = document.createElement("div");
      pin.className = "pin-note note-pin";
      var text = typeof n === "string" ? n : n.text;
      var when = typeof n === "object" && n ? formatShortDate(n.date) : null;
      pin.textContent = when ? text + " — " + when : text;
      return pin;
    });
  }

  // Topics/notes lists can grow indefinitely (capped at 30 server-side), which
  // makes the sidebar unusably long. Show the first few pinned notes and put
  // the rest behind a "See N more" toggle instead of a hard cutoff that loses
  // history, or an always-expanded list that pushes the chat card down.
  var MEMORY_PREVIEW_COUNT = 3;

  function renderCollapsiblePins(container, items, buildPin) {
    container.innerHTML = "";
    if (!items || !items.length) {
      container.innerHTML = '<div class="memory-empty">Nothing yet</div>';
      return;
    }
    items.forEach(function (item, i) {
      var pin = buildPin(item);
      pin.style.transform = i % 2 === 0 ? "rotate(-1deg)" : "rotate(0.9deg)";
      if (i >= MEMORY_PREVIEW_COUNT) pin.hidden = true;
      container.appendChild(pin);
    });
    if (items.length > MEMORY_PREVIEW_COUNT) {
      var hiddenCount = items.length - MEMORY_PREVIEW_COUNT;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-more-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "See " + hiddenCount + " more \u2193";
      btn.addEventListener("click", function () {
        var expanded = btn.getAttribute("aria-expanded") === "true";
        Array.prototype.forEach.call(container.querySelectorAll(".pin-note"), function (pin, i) {
          if (i >= MEMORY_PREVIEW_COUNT) pin.hidden = expanded;
        });
        btn.setAttribute("aria-expanded", String(!expanded));
        btn.textContent = expanded ? "See " + hiddenCount + " more \u2193" : "Show fewer \u2191";
      });
      container.appendChild(btn);
    }
  }

  function addMessage(text, who) {
    var el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    conversation.push({ role: "user", content: text });
    chatInput.value = "";
    chatInput.disabled = true;
    chatSend.disabled = true;

    var pending = addMessage("...", "bot pending");

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: conversation })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        pending.remove();
        chatInput.disabled = false;
        chatSend.disabled = false;
        chatInput.focus();

        if (!result.ok) {
          addMessage(result.data.error || "Something went wrong. Please try again.", "bot");
          return;
        }

        addMessage(result.data.reply, "bot");
        conversation.push({ role: "assistant", content: result.data.reply });
        if (result.data.remembered) renderMemory(Object.assign({ email: accountEmail.textContent }, result.data.remembered));
        speakText(result.data.reply);
      })
      .catch(function () {
        pending.remove();
        chatInput.disabled = false;
        chatSend.disabled = false;
        addMessage("Couldn't reach the server. Please try again.", "bot");
      });
  });

  // ---------------- session self-review ----------------

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderList(items) {
    if (!items || !items.length) {
      return '<div class="review-empty">None noted</div>';
    }
    return (
      '<ul class="review-list">' +
      items.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      "</ul>"
    );
  }

  var DIMENSION_LABELS = {
    loveAndSafety: "Love & safety",
    understandingBeforeGuiding: "Understanding first",
    regulationTiming: "Regulation timing",
    validation: "Validation",
    boundaryWarmth: "Boundary warmth",
    developmentalAppropriateness: "Developmentally appropriate",
    researchGrounding: "Research grounding"
  };

  function renderReview(review) {
    if (review.available === false) {
      reviewBody.innerHTML = '<div class="review-unavailable">' + escapeHtml(review.message) + "</div>";
      return;
    }

    var dims = review.dimensionScores || {};
    var dimChips = Object.keys(DIMENSION_LABELS)
      .filter(function (key) { return dims[key] != null; })
      .map(function (key) {
        return '<span class="review-dim-chip">' + DIMENSION_LABELS[key] + ": " + dims[key] + "/10</span>";
      })
      .join("");

    reviewBody.innerHTML =
      '<div class="review-score-row">' +
        '<span class="review-score-big">' + (review.overallScore != null ? review.overallScore : "—") + '/10</span>' +
        '<span class="review-score-label">overall, based on this session\'s replies</span>' +
      "</div>" +
      (dimChips ? '<div class="review-dims">' + dimChips + "</div>" : "") +
      '<div class="review-section"><div class="review-section-label">What went well</div>' + renderList(review.strengths) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Concerns</div>' + renderList(review.concerns) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Missed opportunities</div>' + renderList(review.missedOpportunities) + "</div>" +
      '<div class="review-section"><div class="review-section-label">Suggested prompt changes</div>' + renderList(review.suggestedPromptChanges) + "</div>" +
      '<div class="review-prompt-note">Saved so patterns across sessions can be folded back into how the assistant is instructed.</div>';
  }

  rateSessionBtn.addEventListener("click", function () {
    if (!conversation.length) {
      reviewPanel.hidden = false;
      reviewBody.innerHTML = '<div class="review-unavailable">Chat a bit first, then rate the session.</div>';
      return;
    }

    reviewPanel.hidden = false;
    rateSessionBtn.disabled = true;
    reviewBody.innerHTML = '<div class="review-loading">Reviewing this session against child development research&hellip;</div>';

    fetch("/api/session/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: conversation })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        rateSessionBtn.disabled = false;
        if (!result.ok) {
          reviewBody.innerHTML = '<div class="review-error">' + escapeHtml(result.data.error || "Something went wrong.") + "</div>";
          return;
        }
        renderReview(result.data);
      })
      .catch(function () {
        rateSessionBtn.disabled = false;
        reviewBody.innerHTML = '<div class="review-error">Couldn\'t reach the server. Please try again.</div>';
      });
  });

  reviewCloseBtn.addEventListener("click", function () {
    reviewPanel.hidden = true;
  });

  // ---------------- account settings ----------------

  function updatePasswordFormUI() {
    currentPasswordField.hidden = !accountHasPassword;
    currentPasswordInput.required = accountHasPassword;
    if (!accountHasPassword) currentPasswordInput.value = "";
    accountPasswordHeading.textContent = accountHasPassword ? "Change password" : "Set a password";
    newPasswordLabel.textContent = accountHasPassword ? "New password" : "Password";
    accountPasswordSubmit.textContent = accountHasPassword ? "Update password" : "Set password";
  }

  // Builds one editable row per remembered child in the account modal, so a
  // wrong or "Unnamed child" entry (see mergeChildren in src/routes/chat.js
  // for how those happen) can be fixed or removed by hand rather than only
  // via full account deletion.
  function renderAccountChildrenList() {
    accountChildrenError.textContent = "";
    accountChildrenError.classList.remove("visible");

    if (!latestChildren.length) {
      accountChildrenList.innerHTML = '<div class="memory-empty">Nothing remembered yet.</div>';
      return;
    }

    accountChildrenList.innerHTML = "";

    // Column titles above the list, once — the repeated inputs below only
    // had placeholders (which vanish once you type), so it wasn't always
    // clear which box was which once a row had real values in it. Deliberately
    // its own class (not .account-child-row) rather than a 2-item version of
    // the real row: a real row is 4 flex items (name, age, Save, Remove), and
    // flexbox grows/shrinks each item based on how many siblings share the
    // row, so a header with only 2 items would size its "Nickname" column
    // wider than the real rows below and throw "Age" out of alignment. The
    // two invisible spacers give this row the same 4 items, so it matches
    // column-for-column at any width.
    var header = document.createElement("div");
    header.className = "account-children-header";
    header.setAttribute("aria-hidden", "true");

    var nameHeader = document.createElement("span");
    nameHeader.className = "account-child-name";
    nameHeader.textContent = "Nickname";

    var ageHeader = document.createElement("span");
    ageHeader.className = "account-child-age";
    ageHeader.textContent = "Age";

    var saveSpacer = document.createElement("span");
    saveSpacer.className = "account-child-save account-children-header-spacer";
    saveSpacer.textContent = "Save";

    var deleteSpacer = document.createElement("span");
    deleteSpacer.className = "account-child-delete account-children-header-spacer";
    deleteSpacer.textContent = "Remove";

    header.appendChild(nameHeader);
    header.appendChild(ageHeader);
    header.appendChild(saveSpacer);
    header.appendChild(deleteSpacer);
    accountChildrenList.appendChild(header);

    latestChildren.forEach(function (child) {
      var row = document.createElement("div");
      row.className = "account-child-row";
      row.dataset.id = child.id;

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "account-child-name";
      nameInput.placeholder = "Name or nickname";
      nameInput.setAttribute("aria-label", "Nickname or name");
      nameInput.value = child.name || "";

      var ageInput = document.createElement("input");
      ageInput.type = "number";
      ageInput.className = "account-child-age";
      ageInput.placeholder = "Age";
      ageInput.setAttribute("aria-label", "Age");
      ageInput.min = "0";
      ageInput.max = "17";
      ageInput.value = child.age != null ? child.age : "";

      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "account-child-save";
      saveBtn.textContent = "Save";

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "account-child-delete";
      deleteBtn.setAttribute("aria-label", "Remove this child");
      deleteBtn.textContent = "Remove";

      row.appendChild(nameInput);
      row.appendChild(ageInput);
      row.appendChild(saveBtn);
      row.appendChild(deleteBtn);
      accountChildrenList.appendChild(row);
    });
  }

  accountChildrenList.addEventListener("click", function (e) {
    var row = e.target.closest(".account-child-row");
    if (!row) return;
    var childId = row.dataset.id;

    if (e.target.classList.contains("account-child-save")) {
      var nameVal = row.querySelector(".account-child-name").value.trim();
      var ageVal = row.querySelector(".account-child-age").value.trim();

      accountChildrenError.textContent = "";
      accountChildrenError.classList.remove("visible");
      e.target.disabled = true;

      fetch("/api/account/children/" + childId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal, age: ageVal === "" ? null : Number(ageVal) })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          e.target.disabled = false;
          if (!result.ok) {
            accountChildrenError.textContent = result.data.error || "Couldn't save that change.";
            accountChildrenError.classList.add("visible");
            return;
          }
          refreshMe();
        })
        .catch(function () {
          e.target.disabled = false;
          accountChildrenError.textContent = "Couldn't reach the server. Please try again.";
          accountChildrenError.classList.add("visible");
        });
    } else if (e.target.classList.contains("account-child-delete")) {
      accountChildrenError.textContent = "";
      accountChildrenError.classList.remove("visible");
      e.target.disabled = true;

      fetch("/api/account/children/" + childId, { method: "DELETE" })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          e.target.disabled = false;
          if (!result.ok) {
            accountChildrenError.textContent = result.data.error || "Couldn't remove that entry.";
            accountChildrenError.classList.add("visible");
            return;
          }
          refreshMe();
        })
        .catch(function () {
          e.target.disabled = false;
          accountChildrenError.textContent = "Couldn't reach the server. Please try again.";
          accountChildrenError.classList.add("visible");
        });
    }
  });

  // Builds one row per remembered topic/note in the account modal, each with
  // just a Remove button — unlike children, there's nothing here to edit in
  // place, only to forget. Shared by both lists since a topic pin and a note
  // pin render identically except for their text; getText/formatWhen pick
  // out the right fields for whichever list this is.
  function renderAccountMemoryList(container, items, getText, formatWhen) {
    container.innerHTML = "";
    if (!items || !items.length) {
      container.innerHTML = '<div class="memory-empty">Nothing remembered yet.</div>';
      return;
    }

    items.forEach(function (item) {
      var text = getText(item);
      var when = formatWhen(item);

      var row = document.createElement("div");
      row.className = "account-memory-row";
      row.dataset.text = text;

      var span = document.createElement("span");
      span.className = "account-memory-text";
      span.textContent = when ? text + " — " + when : text;

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "account-memory-delete";
      deleteBtn.setAttribute("aria-label", "Forget this");
      deleteBtn.textContent = "Remove";

      row.appendChild(span);
      row.appendChild(deleteBtn);
      container.appendChild(row);
    });
  }

  function renderAccountTopicsList() {
    accountTopicsError.textContent = "";
    accountTopicsError.classList.remove("visible");
    renderAccountMemoryList(
      accountTopicsList,
      latestTopics,
      function (t) { return typeof t === "string" ? t : t.topic; },
      function (t) { return typeof t === "object" && t ? formatShortDate(t.lastDiscussedAt) : null; }
    );
  }

  function renderAccountNotesList() {
    renderAccountMemoryList(
      accountNotesList,
      latestNotes,
      function (n) { return typeof n === "string" ? n : n.text; },
      function (n) { return typeof n === "object" && n ? formatShortDate(n.date) : null; }
    );
  }

  function deleteAccountMemoryEntry(kind, text, button) {
    accountTopicsError.textContent = "";
    accountTopicsError.classList.remove("visible");
    button.disabled = true;

    fetch("/api/account/" + kind + "/" + encodeURIComponent(text), { method: "DELETE" })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        button.disabled = false;
        if (!result.ok) {
          accountTopicsError.textContent = result.data.error || "Couldn't remove that entry.";
          accountTopicsError.classList.add("visible");
          return;
        }
        refreshMe();
      })
      .catch(function () {
        button.disabled = false;
        accountTopicsError.textContent = "Couldn't reach the server. Please try again.";
        accountTopicsError.classList.add("visible");
      });
  }

  accountTopicsList.addEventListener("click", function (e) {
    var row = e.target.closest(".account-memory-row");
    if (!row || !e.target.classList.contains("account-memory-delete")) return;
    deleteAccountMemoryEntry("topics", row.dataset.text, e.target);
  });

  accountNotesList.addEventListener("click", function (e) {
    var row = e.target.closest(".account-memory-row");
    if (!row || !e.target.classList.contains("account-memory-delete")) return;
    deleteAccountMemoryEntry("notes", row.dataset.text, e.target);
  });

  // "Download what we remember" — fetches the same family-scoped export the
  // server builds in GET /api/account/export and saves it as a local file,
  // so a parent can verify nothing's hidden without having to ask.
  exportDataBtn.addEventListener("click", function () {
    exportDataBtn.disabled = true;
    var originalText = exportDataBtn.textContent;
    exportDataBtn.textContent = "Preparing download…";

    fetch("/api/account/export")
      .then(function (r) {
        if (!r.ok) throw new Error("export failed");
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "parentswithlove-my-data.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function () {
        window.alert("Couldn't download your data right now. Please try again.");
      })
      .finally(function () {
        exportDataBtn.disabled = false;
        exportDataBtn.textContent = originalText;
      });
  });

  function openAccountModal() {
    accountModalEmail.textContent = currentEmail;
    deleteConfirmEmailHint.textContent = currentEmail;
    accountPasswordError.textContent = "";
    accountPasswordError.classList.remove("visible");
    accountPasswordSuccess.hidden = true;
    accountDeleteError.textContent = "";
    accountDeleteError.classList.remove("visible");
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    deleteConfirmEmailInput.value = "";
    deleteConfirmBlock.hidden = true;
    updatePasswordFormUI();
    renderAccountChildrenList();
    renderAccountTopicsList();
    renderAccountNotesList();
    accountModal.hidden = false;
  }

  function closeAccountModal() {
    accountModal.hidden = true;
  }

  accountModalCloseBtn.addEventListener("click", closeAccountModal);

  accountModal.addEventListener("click", function (e) {
    if (e.target === accountModal) closeAccountModal();
  });

  // Disclaimer modal — lives outside #auth-screen/#app-screen (see index.html)
  // so the "read the full disclaimer" link in the footer works no matter
  // which of those two screens is currently showing.
  var disclaimerMoreBtn = document.getElementById("disclaimer-more-btn");
  var disclaimerModal = document.getElementById("disclaimer-modal");
  var disclaimerModalCloseBtn = document.getElementById("disclaimer-modal-close-btn");

  function openDisclaimerModal() {
    disclaimerModal.hidden = false;
  }

  function closeDisclaimerModal() {
    disclaimerModal.hidden = true;
  }

  disclaimerMoreBtn.addEventListener("click", openDisclaimerModal);
  disclaimerModalCloseBtn.addEventListener("click", closeDisclaimerModal);

  disclaimerModal.addEventListener("click", function (e) {
    if (e.target === disclaimerModal) closeDisclaimerModal();
  });

  accountPasswordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    accountPasswordError.textContent = "";
    accountPasswordError.classList.remove("visible");
    accountPasswordSuccess.hidden = true;
    accountPasswordSubmit.disabled = true;

    fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        accountPasswordSubmit.disabled = false;
        if (!result.ok) {
          accountPasswordError.textContent = result.data.error || "Something went wrong. Please try again.";
          accountPasswordError.classList.add("visible");
          return;
        }
        accountHasPassword = true;
        currentPasswordInput.value = "";
        newPasswordInput.value = "";
        updatePasswordFormUI();
        accountPasswordSuccess.hidden = false;
      })
      .catch(function () {
        accountPasswordSubmit.disabled = false;
        accountPasswordError.textContent = "Couldn't reach the server. Please try again.";
        accountPasswordError.classList.add("visible");
      });
  });

  showDeleteConfirmBtn.addEventListener("click", function () {
    deleteConfirmBlock.hidden = false;
    deleteConfirmEmailInput.focus();
  });

  confirmDeleteBtn.addEventListener("click", function () {
    accountDeleteError.textContent = "";
    accountDeleteError.classList.remove("visible");

    var typed = deleteConfirmEmailInput.value.trim().toLowerCase();
    if (!typed || typed !== currentEmail.trim().toLowerCase()) {
      accountDeleteError.textContent = "That doesn't match your account email.";
      accountDeleteError.classList.add("visible");
      return;
    }

    confirmDeleteBtn.disabled = true;

    fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: deleteConfirmEmailInput.value })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        confirmDeleteBtn.disabled = false;
        if (!result.ok) {
          accountDeleteError.textContent = result.data.error || "Something went wrong. Please try again.";
          accountDeleteError.classList.add("visible");
          return;
        }
        closeAccountModal();
        conversation = [];
        chatLog.innerHTML = "";
        appScreen.hidden = true;
        authScreen.hidden = false;
        passwordInput.value = "";
        stopRecording();
        voicePlayer.pause();
        showAuthError("Your account has been permanently deleted.");
      })
      .catch(function () {
        confirmDeleteBtn.disabled = false;
        accountDeleteError.textContent = "Couldn't reach the server. Please try again.";
        accountDeleteError.classList.add("visible");
      });
  });

  // ---------------- voice input & output ----------------

  function updateVoiceToggleUI() {
    voiceToggleBtn.setAttribute("aria-pressed", readAloudEnabled ? "true" : "false");
    voiceToggleBtn.textContent = readAloudEnabled ? "\uD83D\uDD0A Reading replies aloud" : "\uD83D\uDD08 Read replies aloud";
  }

  voiceToggleBtn.addEventListener("click", function () {
    readAloudEnabled = !readAloudEnabled;
    try {
      window.localStorage.setItem("pwl7_read_aloud", readAloudEnabled ? "1" : "0");
    } catch (e) {
      // Best-effort only — the toggle still works for this page load either way.
    }
    updateVoiceToggleUI();
    if (!readAloudEnabled) {
      voicePlayer.pause();
    }
  });

  function speakText(text) {
    if (!readAloudEnabled || !voiceAvailable || !text) return;

    fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("tts request failed");
        return res.blob();
      })
      .then(function (blob) {
        voicePlayer.src = URL.createObjectURL(blob);
        return voicePlayer.play();
      })
      .catch(function () {
        // Voice is an enhancement on top of the text reply that's already shown —
        // fail silently rather than interrupting the conversation with an error.
      });
  }

  micBtn.addEventListener("click", function () {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }
    startRecording();
  });

  function startRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        var mimeType = "";
        if (window.MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (window.MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }

        recordedChunks = [];
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);

        mediaRecorder.addEventListener("dataavailable", function (e) {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        });

        mediaRecorder.addEventListener("stop", function () {
          stream.getTracks().forEach(function (track) { track.stop(); });
          micBtn.classList.remove("recording");
          var recordedType = mediaRecorder.mimeType || mimeType || "audio/webm";
          mediaRecorder = null;
          if (recordedChunks.length) {
            transcribeAndFill(new Blob(recordedChunks, { type: recordedType }));
          }
        });

        mediaRecorder.start();
        micBtn.classList.add("recording");
      })
      .catch(function () {
        addMessage("Couldn't access your microphone. Check your browser's microphone permission and try again.", "bot");
      });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function transcribeAndFill(blob) {
    micBtn.disabled = true;
    var previousPlaceholder = chatInput.placeholder;
    chatInput.placeholder = "Transcribing\u2026";

    fetch("/api/voice/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        micBtn.disabled = false;
        chatInput.placeholder = previousPlaceholder;
        if (!result.ok) {
          addMessage(result.data.error || "Couldn't transcribe that. Please try again or type your message.", "bot");
          return;
        }
        if (result.data.text) {
          chatInput.value = result.data.text;
          chatInput.focus();
        }
      })
      .catch(function () {
        micBtn.disabled = false;
        chatInput.placeholder = previousPlaceholder;
        addMessage("Couldn't reach the server to transcribe that. Please try again.", "bot");
      });
  }

  // ---------------- boot ----------------

  refreshMe();
})();
