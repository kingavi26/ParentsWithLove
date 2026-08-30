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

  var accountSettingsBtn = document.getElementById("account-settings-btn");
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

  // ---------------- app screen ----------------

  function enterApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
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
        renderMemory(data);
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

    if (data.children && data.children.length) {
      memoryChildren.innerHTML = "";
      data.children.forEach(function (c) {
        var row = document.createElement("div");
        row.className = "child-row";
        row.textContent = (c.name || "Unnamed child") + (c.age != null ? " — age " + c.age : "");
        memoryChildren.appendChild(row);
      });
    } else {
      memoryChildren.innerHTML = '<div class="memory-empty">Nothing yet</div>';
    }

    if (data.topics_discussed && data.topics_discussed.length) {
      memoryTopics.innerHTML = "";
      data.topics_discussed.forEach(function (t) {
        var chip = document.createElement("span");
        chip.className = "chip";
        var topic = typeof t === "string" ? t : t.topic;
        var when = typeof t === "object" && t ? formatShortDate(t.lastDiscussedAt) : null;
        chip.textContent = when ? topic + " (" + when + ")" : topic;
        memoryTopics.appendChild(chip);
      });
    } else {
      memoryTopics.innerHTML = '<div class="memory-empty">Nothing yet</div>';
    }

    if (data.notes && data.notes.length) {
      memoryNotes.innerHTML = "";
      data.notes.forEach(function (n) {
        var item = document.createElement("div");
        item.className = "note-item";
        var text = typeof n === "string" ? n : n.text;
        var when = typeof n === "object" && n ? formatShortDate(n.date) : null;
        item.textContent = when ? text + " — " + when : text;
        memoryNotes.appendChild(item);
      });
    } else {
      memoryNotes.innerHTML = '<div class="memory-empty">Nothing yet</div>';
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
    accountModal.hidden = false;
  }

  function closeAccountModal() {
    accountModal.hidden = true;
  }

  accountSettingsBtn.addEventListener("click", openAccountModal);
  accountModalCloseBtn.addEventListener("click", closeAccountModal);

  accountModal.addEventListener("click", function (e) {
    if (e.target === accountModal) closeAccountModal();
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
