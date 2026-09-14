(function () {
  "use strict";

  var authScreen = document.getElementById("auth-screen");
  var appScreen = document.getElementById("app-screen");
  var authForm = document.getElementById("auth-form");
  var authError = document.getElementById("auth-error");
  var authSubmit = document.getElementById("auth-submit");
  var authTabs = document.querySelectorAll(".auth-tab");
  var socialAuthWrap = document.getElementById("social-auth");
  var appleLoginBtn = document.getElementById("apple-login-btn");
  var googleLoginBtn = document.getElementById("google-login-btn");
  var facebookLoginBtn = document.getElementById("facebook-login-btn");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var authSuccess = document.getElementById("auth-success");
  var authTabsWrap = document.querySelector(".auth-tabs");
  var forgotPasswordLink = document.getElementById("forgot-password-link");
  var forgotPasswordPanel = document.getElementById("forgot-password-panel");
  var forgotPasswordForm = document.getElementById("forgot-password-form");
  var forgotPasswordEmailInput = document.getElementById("forgot-password-email");
  var forgotPasswordError = document.getElementById("forgot-password-error");
  var forgotPasswordSuccess = document.getElementById("forgot-password-success");
  var forgotPasswordSubmit = document.getElementById("forgot-password-submit");
  var backToLoginLink = document.getElementById("back-to-login-link");
  var resetPasswordPanel = document.getElementById("reset-password-panel");
  var resetPasswordForm = document.getElementById("reset-password-form");
  var resetPasswordNewInput = document.getElementById("reset-password-new");
  var resetPasswordError = document.getElementById("reset-password-error");
  var resetPasswordSubmit = document.getElementById("reset-password-submit");
  var verifyEmailBanner = document.getElementById("verify-email-banner");
  var resendVerificationBtn = document.getElementById("resend-verification-btn");

  var demoBanner = document.getElementById("demo-banner");
  var accountEmail = document.getElementById("account-email");
  var logoutBtn = document.getElementById("logout-btn");
  var chatSubtitle = document.getElementById("chat-subtitle");

  var appTopbarTitle = document.getElementById("app-topbar-title");
  var appTopbarBadge = document.getElementById("app-topbar-badge");
  var settingsDisclaimerBtn = document.getElementById("settings-disclaimer-btn");
  var settingsLogoutBtn = document.getElementById("settings-logout-btn");

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

  // ---------------- new-parent intake wizard ----------------
  var intakeModal = document.getElementById("intake-modal");
  var intakeSkipBtn = document.getElementById("intake-skip-btn");
  var intakeProgressDots = document.querySelectorAll("[data-intake-dot]");
  var intakeStep1 = document.getElementById("intake-step-1");
  var intakeStep2 = document.getElementById("intake-step-2");
  var intakeChildrenList = document.getElementById("intake-children-list");
  var intakeAddChildBtn = document.getElementById("intake-add-child-btn");
  var intakeError = document.getElementById("intake-error");
  var intakeConcernsList = document.getElementById("intake-concerns-list");
  var intakeOtherField = document.getElementById("intake-other-field");
  var intakeOtherInput = document.getElementById("intake-other-input");
  var intakeBackBtn = document.getElementById("intake-back-btn");
  var intakeNextBtn = document.getElementById("intake-next-btn");

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
  var memoryTopicsError = document.getElementById("memory-topics-error");
  var memoryNotes = document.getElementById("memory-notes");

  var rateSessionBtn = document.getElementById("rate-session-btn");
  var reviewPanel = document.getElementById("review-panel");
  var reviewBody = document.getElementById("review-body");
  var reviewCloseBtn = document.getElementById("review-close-btn");

  var voiceToggleBtn = document.getElementById("voice-toggle-btn");
  var micBtn = document.getElementById("mic-btn");
  var voicePlayer = document.getElementById("voice-player");

  // ---------------- voice mode (full-screen hands-free overlay) ----------------
  var voiceModeBtn = document.getElementById("voice-mode-btn");
  var voiceModeOverlay = document.getElementById("voice-mode-overlay");
  var voiceModeCloseBtn = document.getElementById("voice-mode-close-btn");
  var voiceModeStateLabel = document.getElementById("voice-mode-state-label");
  var voiceModeCaption = document.getElementById("voice-mode-caption");
  var voiceModeOrbWrap = document.getElementById("voice-mode-orb-wrap");
  var voiceModeOrb = document.getElementById("voice-mode-orb");
  var voiceModeRingCanvas = document.getElementById("voice-mode-ring");
  var voiceModePlayer = document.getElementById("voice-mode-player");

  var authMode = "login"; // or "signup"
  var pendingResetToken = null; // set from ?resetToken=... in the URL, see checkUrlAuthParams()
  var socialAuthAvailable = false; // set from /api/status — whether to ever show the social-auth block on the login view
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

  function showAuthSuccess(message) {
    authSuccess.textContent = message;
    authSuccess.hidden = false;
  }

  function hideAuthSuccess() {
    authSuccess.hidden = true;
  }

  // Three mutually exclusive views inside the auth card: the normal log
  // in/sign up form, the "email me a reset link" request form, and (only
  // reachable via a ?resetToken=... link, see checkUrlAuthParams) the
  // "choose a new password" form. Switching to one always hides the other
  // two plus any stray error/success messages left over from before.
  function showAuthView(view) {
    authTabsWrap.hidden = view !== "login";
    authForm.hidden = view !== "login";
    forgotPasswordLink.hidden = view !== "login";
    socialAuthWrap.hidden = view !== "login" || !socialAuthAvailable;
    forgotPasswordPanel.hidden = view !== "forgot-password";
    resetPasswordPanel.hidden = view !== "reset-password";
    hideAuthError();
    hideAuthSuccess();
  }

  forgotPasswordLink.addEventListener("click", function () {
    forgotPasswordEmailInput.value = emailInput.value || "";
    forgotPasswordError.classList.remove("visible");
    forgotPasswordSuccess.hidden = true;
    forgotPasswordForm.hidden = false;
    showAuthView("forgot-password");
  });

  backToLoginLink.addEventListener("click", function () {
    showAuthView("login");
  });

  forgotPasswordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    forgotPasswordError.classList.remove("visible");
    forgotPasswordSubmit.disabled = true;

    fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotPasswordEmailInput.value })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        forgotPasswordSubmit.disabled = false;
        if (!result.ok) {
          forgotPasswordError.textContent = result.data.error || "Something went wrong. Please try again.";
          forgotPasswordError.classList.add("visible");
          return;
        }
        forgotPasswordSuccess.textContent =
          result.data.message || "If an account exists for that email, we've sent a link to reset the password.";
        forgotPasswordSuccess.hidden = false;
        forgotPasswordForm.hidden = true;
      })
      .catch(function () {
        forgotPasswordSubmit.disabled = false;
        forgotPasswordError.textContent = "Couldn't reach the server. Please try again.";
        forgotPasswordError.classList.add("visible");
      });
  });

  resetPasswordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    resetPasswordError.classList.remove("visible");
    resetPasswordSubmit.disabled = true;

    fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: pendingResetToken, newPassword: resetPasswordNewInput.value })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        resetPasswordSubmit.disabled = false;
        if (!result.ok) {
          resetPasswordError.textContent = result.data.error || "Something went wrong. Please try again.";
          resetPasswordError.classList.add("visible");
          return;
        }
        pendingResetToken = null;
        enterApp();
      })
      .catch(function () {
        resetPasswordSubmit.disabled = false;
        resetPasswordError.textContent = "Couldn't reach the server. Please try again.";
        resetPasswordError.classList.add("visible");
      });
  });

  // A verification-link click or a password-reset link both bring someone
  // back here via a plain browser navigation (GET /api/verify-email
  // redirects to /app?verified=1|0; the reset email links straight to
  // /app?resetToken=...) rather than an app.js-initiated fetch, so this has
  // to read them from the URL on load rather than from a JSON response.
  // Cleans the query string afterward (same pattern already used for
  // ?authError= above) so refreshing the page doesn't re-trigger it.
  (function checkUrlAuthParams() {
    var params = new URLSearchParams(window.location.search);
    var resetToken = params.get("resetToken");
    var verified = params.get("verified");
    var handled = false;

    if (resetToken) {
      pendingResetToken = resetToken;
      showAuthView("reset-password");
      handled = true;
    } else if (verified === "1") {
      showAuthView("login");
      showAuthSuccess("Your email is verified.");
      handled = true;
    } else if (verified === "0") {
      showAuthView("login");
      showAuthError("That verification link is invalid or has expired. You can request a new one from Account settings once logged in.");
      handled = true;
    }

    if (handled) {
      params.delete("resetToken");
      params.delete("verified");
      var rest = params.toString();
      var cleanUrl = window.location.pathname + (rest ? "?" + rest : "");
      window.history.replaceState({}, "", cleanUrl);
    }
  })();

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
    doLogout();
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
        if (appTopbarBadge) appTopbarBadge.hidden = false;
      } else {
        chatSubtitle.textContent = "Connected to OpenAI";
      }

      voiceAvailable = Boolean(data.voiceAvailable);
      if (voiceAvailable) {
        voiceToggleBtn.hidden = false;
        updateVoiceToggleUI();
        if (micSupported) {
          micBtn.hidden = false;
          voiceModeBtn.hidden = false;
        }
      }

      // appleLoginAvailable isn't sent by the server yet (no Apple Sign-In
      // backend/route configured) — this stays inert (button never
      // un-hides) until that's set up, same fail-safe pattern as the other
      // two providers before their credentials existed.
      var appleOn = Boolean(data.appleLoginAvailable);
      var googleOn = Boolean(data.googleLoginAvailable);
      var facebookOn = Boolean(data.facebookLoginAvailable);
      if (appleOn) appleLoginBtn.hidden = false;
      if (googleOn) googleLoginBtn.hidden = false;
      if (facebookOn) facebookLoginBtn.hidden = false;
      socialAuthAvailable = appleOn || googleOn || facebookOn;
      if (socialAuthAvailable) socialAuthWrap.hidden = false;
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

  // ---------------- new-parent intake wizard ----------------
  // Shown once, right after signup (or on the first /api/me after a login
  // whose account never finished it — see the intakeAutoCheckPending hook
  // in refreshMe() below) via POST /api/intake (src/routes/intake.js).
  // Deliberately writes straight into the same tables chat-based fact
  // extraction already uses (children, family_notes.topics_discussed), so
  // nothing downstream — reply-engine.js's context assembly, the Memory
  // tab, Settings' children/topics lists — needs to know this wizard
  // exists at all.

  // Keep this list in sync with src/intake.js's INTAKE_CONCERNS — these are
  // the exact strings the server validates against and stores as a
  // remembered topic, so the chip label and the saved fact are identical.
  var INTAKE_CONCERNS = [
    "Bedtime & sleep",
    "Tantrums & big emotions",
    "Sibling conflict",
    "Screen time & tech",
    "Listening & cooperation",
    "Discipline & setting boundaries",
    "School, homework, or focus",
    "Friendships & social stuff",
    "Separation anxiety / clinginess",
    "Mealtime battles",
    "Potty training",
    "A big change lately",
    "Talking about feelings"
  ];
  var INTAKE_MAX_CHILDREN = 8;

  // Guards the auto-open-on-entry check so it only ever fires once per
  // login/signup/page-load, never on the many other refreshMe() calls that
  // happen afterward (deleting a topic, exporting data, etc.) — see the
  // hook inside refreshMe() below, and the reset in doLogout()/refreshMe()'s
  // own .catch() above.
  var intakeAutoCheckPending = true;
  var intakeChildren = [];
  var intakeSelectedConcerns = [];
  var intakeNotSureYet = false;
  var intakeStepNum = 1;

  function renderIntakeChildren() {
    intakeChildrenList.innerHTML = "";
    intakeChildren.forEach(function (child, index) {
      var row = document.createElement("div");
      row.className = "intake-child-row";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "intake-child-name";
      nameInput.placeholder = "Name or nickname";
      nameInput.maxLength = 100;
      nameInput.value = child.name || "";
      nameInput.addEventListener("input", function () {
        intakeChildren[index].name = nameInput.value;
      });

      var ageInput = document.createElement("input");
      ageInput.type = "number";
      ageInput.className = "intake-child-age";
      ageInput.placeholder = "Age";
      ageInput.min = "0";
      ageInput.max = "17";
      ageInput.value = child.age === "" || child.age == null ? "" : child.age;
      ageInput.addEventListener("input", function () {
        intakeChildren[index].age = ageInput.value;
      });

      row.appendChild(nameInput);
      row.appendChild(ageInput);

      // Always leave at least one row on screen — removing the last one
      // would leave a parent staring at an empty section with no obvious
      // way back in short of the "+ Add a child" button below it.
      if (intakeChildren.length > 1) {
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "intake-child-remove";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", function () {
          intakeChildren.splice(index, 1);
          renderIntakeChildren();
        });
        row.appendChild(removeBtn);
      }

      intakeChildrenList.appendChild(row);
    });

    intakeAddChildBtn.disabled = intakeChildren.length >= INTAKE_MAX_CHILDREN;
  }

  intakeAddChildBtn.addEventListener("click", function () {
    if (intakeChildren.length >= INTAKE_MAX_CHILDREN) return;
    intakeChildren.push({ name: "", age: "" });
    renderIntakeChildren();
  });

  function renderIntakeConcerns() {
    intakeConcernsList.innerHTML = "";

    INTAKE_CONCERNS.forEach(function (concern) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "concern-chip";
      chip.textContent = concern;
      chip.classList.toggle("selected", intakeSelectedConcerns.indexOf(concern) !== -1);
      chip.addEventListener("click", function () {
        toggleConcern(concern);
      });
      intakeConcernsList.appendChild(chip);
    });

    var otherChip = document.createElement("button");
    otherChip.type = "button";
    otherChip.className = "concern-chip";
    otherChip.textContent = "Something else";
    otherChip.classList.toggle("selected", !intakeOtherField.hidden);
    otherChip.addEventListener("click", function () {
      intakeNotSureYet = false;
      intakeOtherField.hidden = !intakeOtherField.hidden;
      if (intakeOtherField.hidden) {
        intakeOtherInput.value = "";
      } else {
        intakeOtherInput.focus();
      }
      renderIntakeConcerns();
    });
    intakeConcernsList.appendChild(otherChip);

    var notSureChip = document.createElement("button");
    notSureChip.type = "button";
    notSureChip.className = "concern-chip concern-chip-neutral";
    notSureChip.textContent = "Not sure yet / just exploring";
    notSureChip.classList.toggle("selected", intakeNotSureYet);
    notSureChip.addEventListener("click", function () {
      toggleNotSureYet();
    });
    intakeConcernsList.appendChild(notSureChip);
  }

  // A concern pick and "Not sure yet" are mutually exclusive (see the plan:
  // "Not sure yet" is a valid answer on its own) — picking either clears
  // the other rather than letting both sit selected at once.
  function toggleConcern(concern) {
    intakeNotSureYet = false;
    var index = intakeSelectedConcerns.indexOf(concern);
    if (index === -1) {
      intakeSelectedConcerns.push(concern);
    } else {
      intakeSelectedConcerns.splice(index, 1);
    }
    renderIntakeConcerns();
  }

  function toggleNotSureYet() {
    intakeNotSureYet = !intakeNotSureYet;
    if (intakeNotSureYet) {
      intakeSelectedConcerns = [];
      intakeOtherField.hidden = true;
      intakeOtherInput.value = "";
    }
    renderIntakeConcerns();
  }

  function showIntakeStep(step) {
    intakeStepNum = step;
    intakeStep1.hidden = step !== 1;
    intakeStep2.hidden = step !== 2;
    intakeBackBtn.hidden = step === 1;
    intakeNextBtn.textContent = step === 1 ? "Continue" : "Finish";
    intakeProgressDots.forEach(function (dot) {
      dot.classList.toggle("active", Number(dot.getAttribute("data-intake-dot")) <= step);
    });
  }

  function openIntakeModal() {
    intakeChildren = [{ name: "", age: "" }];
    intakeSelectedConcerns = [];
    intakeNotSureYet = false;
    intakeError.textContent = "";
    intakeError.classList.remove("visible");
    intakeOtherField.hidden = true;
    intakeOtherInput.value = "";
    renderIntakeChildren();
    renderIntakeConcerns();
    showIntakeStep(1);
    intakeModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeIntakeModal() {
    intakeModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  // Drops any row with neither a name nor an age (e.g. a parent added a
  // second row via "+ Add a child" and then left it blank) rather than
  // sending it to the server, which would otherwise 400 on it.
  function collectIntakeChildren() {
    return intakeChildren
      .map(function (c) {
        return {
          name: (c.name || "").trim(),
          age: c.age === "" || c.age == null ? null : Number(c.age)
        };
      })
      .filter(function (c) {
        return c.name || c.age != null;
      });
  }

  // Handles both "Continue"/"Finish" and "Skip for now" — skipping just
  // means submitting whatever (if anything) has been filled in so far, so
  // both buttons call this same function rather than a separate skip path.
  function submitIntake() {
    intakeError.textContent = "";
    intakeError.classList.remove("visible");

    var payload = {
      children: collectIntakeChildren(),
      concerns: intakeNotSureYet ? [] : intakeSelectedConcerns.slice(),
      otherConcern: intakeNotSureYet ? "" : intakeOtherInput.value,
      notSureYet: intakeNotSureYet
    };

    intakeNextBtn.disabled = true;
    intakeSkipBtn.disabled = true;
    if (!intakeBackBtn.hidden) intakeBackBtn.disabled = true;

    fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        intakeNextBtn.disabled = false;
        intakeSkipBtn.disabled = false;
        intakeBackBtn.disabled = false;
        if (!result.ok) {
          intakeError.textContent = result.data.error || "Something went wrong. Please try again.";
          intakeError.classList.add("visible");
          return;
        }
        closeIntakeModal();
        refreshMe();
      })
      .catch(function () {
        intakeNextBtn.disabled = false;
        intakeSkipBtn.disabled = false;
        intakeBackBtn.disabled = false;
        intakeError.textContent = "Couldn't reach the server. Please try again.";
        intakeError.classList.add("visible");
      });
  }

  intakeNextBtn.addEventListener("click", function () {
    if (intakeStepNum === 1) {
      showIntakeStep(2);
      return;
    }
    submitIntake();
  });

  intakeBackBtn.addEventListener("click", function () {
    showIntakeStep(1);
  });

  intakeSkipBtn.addEventListener("click", function () {
    submitIntake();
  });

  // ---------------- app screen: nav + screens ----------------
  // The app is a real shell with distinct screens (Home / Chat / Memory),
  // switched by showScreen(), rather than one long page with everything
  // stacked. "Settings" in the nav opens the existing account modal instead
  // of switching screens, so whichever screen was behind it stays active
  // when the modal closes.

  var SCREEN_TITLES = { home: "Home", chat: "Chat", memory: "Memory", settings: "Settings" };

  function setTopbarTitle(name) {
    if (appTopbarTitle) appTopbarTitle.textContent = SCREEN_TITLES[name] || "";
  }

  var currentScreen = "home";

  function showScreen(name) {
    screenHome.hidden = name !== "home";
    screenChat.hidden = name !== "chat";
    screenMemory.hidden = name !== "memory";
    currentScreen = name;
    setTopbarTitle(name);
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
    // Always set (and clear, if empty) the input rather than only setting
    // it when non-empty — otherwise the "Something else" quick action
    // (which has no pre-filled prompt, by design) could leave behind
    // whatever an earlier quick-action card had pre-filled if the parent
    // clicked it, went back to Home, and picked "Something else" without
    // sending. Then always focus it so the parent lands ready to type.
    chatInput.value = text || "";
    chatInput.focus();
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
      // Clear out any pills left over from rendering a different account
      // earlier in this same page's lifetime (e.g. log out, then sign up
      // or log in as someone else without a full reload) — otherwise the
      // previous account's kid pills stay in the DOM and, combined with
      // the [hidden] cascade fix in styles.css, could still be visible.
      homeKids.innerHTML = "";
      homeKids.hidden = true;
    }
  }

  // ---------------- app screen ----------------

  function enterApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    document.body.classList.add("app-active");
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
        document.body.classList.add("app-active");
        accountEmail.textContent = data.email;
        currentEmail = data.email;
        accountHasPassword = Boolean(data.hasPassword);
        renderVerifyEmailBanner(data);
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
        // Only ever act on hasCompletedIntake once per "entry" into the app
        // (first successful /api/me after login/signup, or a page reload
        // with an existing session cookie) — refreshMe() also runs after
        // plenty of other in-app actions (deleting a topic, exporting data,
        // etc.) and none of those should ever pop the wizard back up.
        if (intakeAutoCheckPending) {
          intakeAutoCheckPending = false;
          if (!data.hasCompletedIntake) {
            openIntakeModal();
          }
        }
      })
      .catch(function () {
        appScreen.hidden = true;
        authScreen.hidden = false;
        document.body.classList.remove("app-active");
        intakeAutoCheckPending = true;
      });
  }

  // data.emailVerified is false only for a password account that hasn't
  // clicked its signup verification link yet — social accounts arrive
  // already verified (see social-auth.js) and never show this.
  function renderVerifyEmailBanner(data) {
    verifyEmailBanner.hidden = Boolean(data.emailVerified);
  }

  resendVerificationBtn.addEventListener("click", function () {
    resendVerificationBtn.disabled = true;
    var originalLabel = resendVerificationBtn.textContent;
    fetch("/api/resend-verification", { method: "POST" })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          resendVerificationBtn.textContent = "Sent — check your inbox";
          setTimeout(function () {
            resendVerificationBtn.textContent = originalLabel;
            resendVerificationBtn.disabled = false;
          }, 8000);
        } else {
          resendVerificationBtn.disabled = false;
          window.alert(result.data.error || "Something went wrong. Please try again.");
        }
      })
      .catch(function () {
        resendVerificationBtn.disabled = false;
        window.alert("Couldn't reach the server. Please try again.");
      });
  });

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

      var text = document.createElement("span");
      text.className = "pin-text";
      text.textContent = when ? topic + " — last talked about " + when : topic;
      pin.appendChild(text);

      // Lets a parent forget one remembered topic right from the sidebar
      // they're already looking at, instead of only through Account
      // settings — same DELETE /api/account/topics/:topic endpoint and
      // deleteAccountMemoryEntry() helper as the settings modal's "Remove"
      // buttons use, just styled as an inline link to fit the pin.
      var del = document.createElement("button");
      del.type = "button";
      del.className = "pin-delete-link";
      del.dataset.topic = topic;
      del.setAttribute("aria-label", 'Delete "' + topic + '" from what we remember');
      del.textContent = "Delete";
      pin.appendChild(del);

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

  // sources (optional): the array the server returned alongside a bot
  // reply — [{id, org, title, url}], already picked by the backend from
  // src/research-sources.js. Never build this from anything the user
  // typed; it only ever comes straight from result.data.sources.
  function addMessage(text, who, sources) {
    var el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;

    if (!sources || !sources.length) {
      chatLog.appendChild(el);
      chatLog.scrollTop = chatLog.scrollHeight;
      return el;
    }

    // Wrap bubble + sources control together so it stays pinned under this
    // one reply, left-aligned and width-matched like a normal bot bubble
    // (see .msg-group-bot in styles.css). The org names themselves stay
    // hidden behind a "See sources" toggle rather than showing by default
    // on every reply — expanding reveals them right here in the chat
    // (same pattern as the memory sidebar's "See N more" toggle above).
    var group = document.createElement("div");
    group.className = "msg-group-bot";
    group.appendChild(el);

    var detail = document.createElement("div");
    detail.className = "msg-sources";
    detail.hidden = true;

    var label = document.createElement("span");
    label.className = "msg-sources-label";
    label.textContent = "Based on: ";
    detail.appendChild(label);

    sources.forEach(function (s, i) {
      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "msg-sources-sep";
        sep.textContent = "·";
        detail.appendChild(sep);
      }
      var link = document.createElement("a");
      link.href = s.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = s.org;
      detail.appendChild(link);
    });

    var allSep = document.createElement("span");
    allSep.className = "msg-sources-sep";
    allSep.textContent = "—";
    detail.appendChild(allSep);

    var allLink = document.createElement("a");
    allLink.className = "msg-sources-all";
    allLink.href = "/sources.html";
    allLink.target = "_blank";
    allLink.rel = "noopener";
    allLink.textContent = "See all sources";
    detail.appendChild(allLink);

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "msg-sources-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "See sources";
    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      detail.hidden = expanded;
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? "See sources" : "Hide sources";
    });

    group.appendChild(toggle);
    group.appendChild(detail);
    chatLog.appendChild(group);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  // Animated "assistant is typing" bubble (three bouncing dots, CSS-driven —
  // see .typing-dots / @keyframes typing-bounce in styles.css) shown while a
  // /api/chat request is in flight. Built with createElement rather than the
  // el.textContent used by addMessage() above, since this one needs child
  // elements to animate individually rather than a plain text node; nothing
  // here comes from user or server input, so no escaping is needed.
  function addTypingIndicator() {
    var el = document.createElement("div");
    el.className = "msg bot pending";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Assistant is typing");
    var dots = document.createElement("span");
    dots.className = "typing-dots";
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement("span"));
    el.appendChild(dots);
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  // Shared by the typed chat form and voice mode (see the "voice mode"
  // section near the bottom of this file) so both paths append to the same
  // on-screen transcript and the same `conversation` history — a user can
  // start a thought by voice and finish it by typing (or vice versa)
  // without losing context. Returns a promise resolving to
  // { ok: true, reply } or { ok: false, error } — voice mode uses this to
  // decide what to speak next; the typed form ignores the return value.
  // opts.viaVoice suppresses the typed-input-box UI updates and the
  // regular read-aloud call (voice mode does its own TTS with the
  // reactive orb instead of calling speakText()).
  function sendChatMessage(text, opts) {
    opts = opts || {};

    addMessage(text, "user");
    conversation.push({ role: "user", content: text });
    if (!opts.viaVoice) {
      chatInput.value = "";
      chatInput.disabled = true;
      chatSend.disabled = true;
    }

    var pending = addTypingIndicator();

    return fetch("/api/chat", {
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
        if (!opts.viaVoice) {
          chatInput.disabled = false;
          chatSend.disabled = false;
          chatInput.focus();
        }

        if (!result.ok) {
          var errMsg = result.data.error || "Something went wrong. Please try again.";
          addMessage(errMsg, "bot");
          return { ok: false, error: errMsg };
        }

        addMessage(result.data.reply, "bot", result.data.sources);
        conversation.push({ role: "assistant", content: result.data.reply });
        if (result.data.remembered) renderMemory(Object.assign({ email: accountEmail.textContent }, result.data.remembered));
        if (!opts.viaVoice) speakText(result.data.reply);
        return { ok: true, reply: result.data.reply };
      })
      .catch(function () {
        pending.remove();
        if (!opts.viaVoice) {
          chatInput.disabled = false;
          chatSend.disabled = false;
        }
        var errMsg = "Couldn't reach the server. Please try again.";
        addMessage(errMsg, "bot");
        return { ok: false, error: errMsg };
      });
  }

  chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text) return;
    sendChatMessage(text);
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
  // Topics/notes can grow to 20-30 entries (server-side cap — see
  // mergeTopics/mergeNotes in src/routes/chat.js), which made this list a
  // long wall of Remove buttons in Account settings. Reuses the same
  // preview-count-plus-toggle pattern as the read-only "What we remember"
  // sidebar (MEMORY_PREVIEW_COUNT / .memory-more-btn above) so a long
  // history stays skimmable instead of dominating the modal.
  function renderAccountMemoryList(container, items, getText, formatWhen) {
    container.innerHTML = "";
    if (!items || !items.length) {
      container.innerHTML = '<div class="memory-empty">Nothing remembered yet.</div>';
      return;
    }

    items.forEach(function (item, i) {
      var text = getText(item);
      var when = formatWhen(item);

      var row = document.createElement("div");
      row.className = "account-memory-row";
      row.dataset.text = text;
      if (i >= MEMORY_PREVIEW_COUNT) row.hidden = true;

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

    if (items.length > MEMORY_PREVIEW_COUNT) {
      var hiddenCount = items.length - MEMORY_PREVIEW_COUNT;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-more-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "See " + hiddenCount + " more ↓";
      btn.addEventListener("click", function () {
        var expanded = btn.getAttribute("aria-expanded") === "true";
        Array.prototype.forEach.call(container.querySelectorAll(".account-memory-row"), function (row, i) {
          if (i >= MEMORY_PREVIEW_COUNT) row.hidden = expanded;
        });
        btn.setAttribute("aria-expanded", String(!expanded));
        btn.textContent = expanded ? "See " + hiddenCount + " more ↓" : "Show fewer ↑";
      });
      container.appendChild(btn);
    }
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

  // errorEl defaults to the Account-settings error slot (accountTopicsError
  // has always doubled up for both the topics and notes lists there) so the
  // two existing call sites below don't need to change; the Memory-sidebar
  // "Delete" link (renderMemory's topics buildPin) passes memoryTopicsError
  // instead, since that error needs to show next to the sidebar, not inside
  // a settings modal that may not even be open.
  function deleteAccountMemoryEntry(kind, text, button, errorEl) {
    errorEl = errorEl || accountTopicsError;
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
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
          errorEl.textContent = result.data.error || "Couldn't remove that entry.";
          errorEl.classList.add("visible");
          return;
        }
        refreshMe();
      })
      .catch(function () {
        button.disabled = false;
        errorEl.textContent = "Couldn't reach the server. Please try again.";
        errorEl.classList.add("visible");
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

  memoryTopics.addEventListener("click", function (e) {
    if (!e.target.classList.contains("pin-delete-link")) return;
    deleteAccountMemoryEntry("topics", e.target.dataset.topic, e.target, memoryTopicsError);
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
    document.body.classList.add("modal-open");
    setTopbarTitle("settings");
  }

  function closeAccountModal() {
    accountModal.hidden = true;
    document.body.classList.remove("modal-open");
    setTopbarTitle(currentScreen);
  }

  accountModalCloseBtn.addEventListener("click", closeAccountModal);

  accountModal.addEventListener("click", function (e) {
    if (e.target === accountModal) closeAccountModal();
  });

  function doLogout() {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      conversation = [];
      chatLog.innerHTML = "";
      appScreen.hidden = true;
      authScreen.hidden = false;
      passwordInput.value = "";
      accountModal.hidden = true;
      intakeModal.hidden = true;
      document.body.classList.remove("modal-open");
      document.body.classList.remove("app-active");
      stopRecording();
      voicePlayer.pause();
      intakeAutoCheckPending = true;
    });
  }

  if (settingsLogoutBtn) settingsLogoutBtn.addEventListener("click", doLogout);
  if (settingsDisclaimerBtn) {
    settingsDisclaimerBtn.addEventListener("click", function () {
      openDisclaimerModal();
    });
  }

  // Disclaimer modal — lives outside #auth-screen/#app-screen (see index.html)
  // so the "read the full disclaimer" link in the footer works no matter
  // which of those two screens is currently showing.
  var disclaimerMoreBtn = document.getElementById("disclaimer-more-btn");
  var disclaimerModal = document.getElementById("disclaimer-modal");
  var disclaimerModalCloseBtn = document.getElementById("disclaimer-modal-close-btn");

  function openDisclaimerModal() {
    disclaimerModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeDisclaimerModal() {
    disclaimerModal.hidden = true;
    document.body.classList.remove("modal-open");
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
        document.body.classList.remove("app-active");
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

  // ---------------- voice mode (full-screen hands-free overlay) ----------------
  // A real conversation loop, not a scripted demo: tap the orb to record,
  // it auto-stops on silence (or a manual tap, or a 20s cap), transcribes
  // via /api/voice/transcribe, sends the result through the same
  // sendChatMessage() the typed chat box uses, then speaks the reply via
  // /api/voice/speak. The orb's ring/glow react to real audio levels — the
  // mic while listening, the reply's own playback while speaking — via the
  // Web Audio API, not a scripted animation.
  //
  // State machine: idle -> listening -> thinking -> speaking -> idle, with
  // an "error" state for mic/network failures. voState is the single
  // source of truth; every async callback below re-checks it before acting
  // so that closing the overlay (which forces state back to "idle") cleanly
  // stops any in-flight recording, transcription, chat call, or playback
  // rather than letting it land after the user has moved on.

  var voState = "idle";
  var voReduceMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var voRecorder = null;
  var voRecordedChunks = [];
  var voMicStream = null;
  var voHasSpoken = false;
  var voLastSpeechAt = 0;
  var voRecordStartedAt = 0;
  var voAutoStopTimer = null;
  var voAbort = null;

  var VO_MAX_MS = 20000; // hard cap so a stuck recording can't run forever
  var VO_MIN_MS = 600; // ignore silence-based auto-stop for this long, so a quick "um" doesn't cut itself off
  var VO_SILENCE_MS = 1600; // how long to hear nothing after speech before auto-stopping
  var VO_SPEECH_LEVEL = 0.12; // level above which we count it as "the user is talking"

  var voAudioCtx = null;
  var voMicSource = null;
  var voMicAnalyser = null;
  var voPlaybackSource = null; // createMediaElementSource can only be called once per <audio> ever — created lazily, reused for every reply
  var voPlaybackAnalyser = null;
  var voLevelBuf = null;
  var voLevelRAF = null;
  var voCurrentLevel = 0;

  var voRingCtx = voiceModeRingCanvas ? voiceModeRingCanvas.getContext("2d") : null;
  var voRingRAF = null;
  var voRingT = 0;

  var VO_STATE_LABELS = {
    idle: "Tap to talk",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    error: "Let's try again"
  };

  function getVoAudioCtx() {
    if (!voAudioCtx) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      voAudioCtx = new AudioCtor();
    }
    if (voAudioCtx.state === "suspended") voAudioCtx.resume();
    return voAudioCtx;
  }

  function setVoState(next) {
    voState = next;
    voiceModeOverlay.setAttribute("data-state", next);
    voiceModeStateLabel.textContent = VO_STATE_LABELS[next] || "";
    voiceModeOrb.setAttribute(
      "aria-label",
      next === "listening" ? "Stop listening" : next === "speaking" ? "Stop speaking" : "Tap to talk"
    );
  }

  function voStartLevelLoop(analyser) {
    voStopLevelLoop();
    voLevelBuf = new Uint8Array(analyser.fftSize);
    function tick() {
      analyser.getByteTimeDomainData(voLevelBuf);
      var sumSquares = 0;
      for (var i = 0; i < voLevelBuf.length; i++) {
        var v = (voLevelBuf[i] - 128) / 128;
        sumSquares += v * v;
      }
      var rms = Math.sqrt(sumSquares / voLevelBuf.length);
      voCurrentLevel = Math.min(1, rms * 3.5);
      if (voiceModeOrbWrap) voiceModeOrbWrap.style.setProperty("--level", voCurrentLevel.toFixed(3));
      voLevelRAF = requestAnimationFrame(tick);
    }
    voLevelRAF = requestAnimationFrame(tick);
  }

  function voStopLevelLoop() {
    if (voLevelRAF) cancelAnimationFrame(voLevelRAF);
    voLevelRAF = null;
    voCurrentLevel = 0;
    if (voiceModeOrbWrap) voiceModeOrbWrap.style.setProperty("--level", "0");
  }

  function voRingAmplitude(state) {
    if (state === "listening") return 6;
    if (state === "speaking") return 8;
    if (state === "thinking") return 3;
    return 1.2;
  }

  function voRingColor(state) {
    if (state === "listening") return "111,147,184";
    if (state === "speaking") return "255,210,138";
    if (state === "error") return "255,138,122";
    return "201,138,62";
  }

  function voDrawRing() {
    if (voRingCtx) {
      var w = voiceModeRingCanvas.width;
      var h = voiceModeRingCanvas.height;
      voRingCtx.clearRect(0, 0, w, h);
      var cx = w / 2;
      var cy = h / 2;
      var baseR = Math.min(w, h) * 0.42;
      var amp = voRingAmplitude(voState) * (0.5 + voCurrentLevel * 1.5);
      var points = 96;
      voRingCtx.beginPath();
      for (var i = 0; i <= points; i++) {
        var a = (i / points) * Math.PI * 2;
        var wobble = Math.sin(a * 3 + voRingT) * amp * 0.5 + Math.sin(a * 5 - voRingT * 1.3) * amp * 0.3;
        var r = baseR + wobble;
        var x = cx + Math.cos(a) * r;
        var y = cy + Math.sin(a) * r;
        if (i === 0) voRingCtx.moveTo(x, y);
        else voRingCtx.lineTo(x, y);
      }
      voRingCtx.closePath();
      voRingCtx.strokeStyle = "rgba(" + voRingColor(voState) + "," + (0.55 + voCurrentLevel * 0.3) + ")";
      voRingCtx.lineWidth = 2;
      voRingCtx.stroke();
      if (!voReduceMotion) voRingT += 0.02 + voCurrentLevel * 0.03;
    }
    voRingRAF = requestAnimationFrame(voDrawRing);
  }

  function voStartRingLoop() {
    if (voRingRAF) return;
    voRingT = 0;
    voRingRAF = requestAnimationFrame(voDrawRing);
  }

  function voStopRingLoop() {
    if (voRingRAF) cancelAnimationFrame(voRingRAF);
    voRingRAF = null;
  }

  function voTeardownMic() {
    voStopLevelLoop();
    if (voMicStream) {
      voMicStream.getTracks().forEach(function (track) { track.stop(); });
      voMicStream = null;
    }
    if (voMicSource) {
      try { voMicSource.disconnect(); } catch (e) { /* already disconnected */ }
      voMicSource = null;
    }
    if (voMicAnalyser) {
      try { voMicAnalyser.disconnect(); } catch (e) { /* already disconnected */ }
      voMicAnalyser = null;
    }
    if (voAutoStopTimer) {
      clearInterval(voAutoStopTimer);
      voAutoStopTimer = null;
    }
    voRecorder = null;
  }

  function voScheduleAutoStop() {
    clearInterval(voAutoStopTimer);
    voAutoStopTimer = setInterval(function () {
      if (voState !== "listening") {
        clearInterval(voAutoStopTimer);
        return;
      }
      var elapsed = Date.now() - voRecordStartedAt;
      if (voCurrentLevel > VO_SPEECH_LEVEL) {
        voHasSpoken = true;
        voLastSpeechAt = Date.now();
      }
      if (elapsed >= VO_MAX_MS) {
        stopVoiceListening();
        return;
      }
      if (voHasSpoken && elapsed >= VO_MIN_MS && Date.now() - voLastSpeechAt >= VO_SILENCE_MS) {
        stopVoiceListening();
      }
    }, 150);
  }

  function startVoiceListening() {
    getVoAudioCtx(); // created/resumed inside this click gesture so later TTS playback isn't blocked by autoplay policy
    voiceModeCaption.textContent = "";

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        voMicStream = stream;
        var mimeType = "";
        if (window.MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (window.MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }

        voRecordedChunks = [];
        voRecorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);

        voRecorder.addEventListener("dataavailable", function (e) {
          if (e.data && e.data.size > 0) voRecordedChunks.push(e.data);
        });

        voRecorder.addEventListener("stop", function () {
          var recordedType = voRecorder ? voRecorder.mimeType || mimeType || "audio/webm" : mimeType || "audio/webm";
          var blob = new Blob(voRecordedChunks, { type: recordedType });
          var hadSpoken = voHasSpoken;
          var wasCancelled = voState === "idle";
          voTeardownMic();
          if (wasCancelled) return;
          if (!hadSpoken || blob.size < 800) {
            setVoState("idle");
            voiceModeCaption.textContent = "Didn't catch anything — tap the orb and try again.";
            return;
          }
          handleVoiceTranscription(blob);
        });

        try {
          var ctx = getVoAudioCtx();
          voMicSource = ctx.createMediaStreamSource(stream);
          voMicAnalyser = ctx.createAnalyser();
          voMicAnalyser.fftSize = 512;
          voMicSource.connect(voMicAnalyser);
          voStartLevelLoop(voMicAnalyser);
        } catch (e) {
          // The reactive ring is a visual enhancement only — recording still works without it.
        }

        voHasSpoken = false;
        voRecordStartedAt = Date.now();
        voRecorder.start();
        setVoState("listening");
        voScheduleAutoStop();
      })
      .catch(function () {
        setVoState("error");
        voiceModeCaption.textContent = "Couldn't access your microphone. Check your browser's microphone permission and try again.";
      });
  }

  function stopVoiceListening() {
    clearInterval(voAutoStopTimer);
    if (voRecorder && voRecorder.state === "recording") {
      setVoState("thinking");
      voiceModeCaption.textContent = "";
      voRecorder.stop();
    }
  }

  function handleVoiceTranscription(blob) {
    voAbort = new AbortController();
    fetch("/api/voice/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
      signal: voAbort.signal
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (voState !== "thinking") return; // overlay closed, or the user backed out, meanwhile
        if (!result.ok || !result.data.text || !result.data.text.trim()) {
          setVoState("idle");
          voiceModeCaption.textContent = (result.data && result.data.error) || "Didn't catch that — tap the orb and try again.";
          return;
        }
        var text = result.data.text.trim();
        voiceModeCaption.textContent = text;
        sendChatMessage(text, { viaVoice: true }).then(function (result2) {
          if (voState !== "thinking") return;
          if (!result2.ok) {
            setVoState("idle");
            voiceModeCaption.textContent = result2.error || "Something went wrong. Please try again.";
            return;
          }
          voiceModeCaption.textContent = result2.reply;
          speakVoiceReply(result2.reply);
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        setVoState("idle");
        voiceModeCaption.textContent = "Couldn't reach the server to transcribe that. Please try again.";
      });
  }

  function speakVoiceReply(text) {
    if (!voiceAvailable || !text) {
      setVoState("idle");
      return;
    }
    setVoState("speaking");
    voAbort = new AbortController();

    fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
      signal: voAbort.signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error("tts request failed");
        return res.blob();
      })
      .then(function (blob) {
        if (voState !== "speaking") return;
        voiceModePlayer.src = URL.createObjectURL(blob);
        try {
          var ctx = getVoAudioCtx();
          if (!voPlaybackSource) {
            voPlaybackSource = ctx.createMediaElementSource(voiceModePlayer);
            voPlaybackAnalyser = ctx.createAnalyser();
            voPlaybackAnalyser.fftSize = 512;
            // createMediaElementSource redirects the element's own output into
            // the Web Audio graph, so the analyser has to be wired back to the
            // speakers itself or the reply would go visually-reactive but silent.
            voPlaybackSource.connect(voPlaybackAnalyser);
            voPlaybackAnalyser.connect(ctx.destination);
          }
          voStartLevelLoop(voPlaybackAnalyser);
        } catch (e) {
          // Reactive orb is a visual enhancement only — playback still works without it.
        }
        return voiceModePlayer.play();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        // The reply text is already shown as the caption — skip the audio
        // rather than interrupting the conversation with an error state.
        finishVoiceSpeaking();
      });
  }

  function finishVoiceSpeaking() {
    voStopLevelLoop();
    if (voState === "speaking") setVoState("idle");
  }

  function interruptVoiceSpeaking() {
    voiceModePlayer.pause();
    voiceModePlayer.currentTime = 0;
    finishVoiceSpeaking();
  }

  voiceModePlayer.addEventListener("ended", finishVoiceSpeaking);

  function handleVoiceOrbTap() {
    if (voState === "idle" || voState === "error") {
      startVoiceListening();
    } else if (voState === "listening") {
      stopVoiceListening();
    } else if (voState === "speaking") {
      interruptVoiceSpeaking();
    }
    // "thinking" ignores taps — nothing to start or stop mid-flight.
  }

  function cancelVoiceFlow() {
    setVoState("idle");
    if (voAbort) {
      voAbort.abort();
      voAbort = null;
    }
    if (voRecorder && voRecorder.state === "recording") {
      voRecorder.stop();
    }
    voTeardownMic();
    voiceModePlayer.pause();
    voStopLevelLoop();
  }

  function onVoiceModeKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeVoiceMode();
    }
  }

  function openVoiceMode() {
    if (!voiceAvailable || !micSupported) return;
    voiceModeOverlay.hidden = false;
    document.body.classList.add("modal-open");
    setVoState("idle");
    voiceModeCaption.textContent = "Tap the orb and ask about your kid.";
    voStartRingLoop();
    document.addEventListener("keydown", onVoiceModeKeydown);
    voiceModeCloseBtn.focus();
  }

  function closeVoiceMode() {
    cancelVoiceFlow();
    voiceModeOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    voStopRingLoop();
    document.removeEventListener("keydown", onVoiceModeKeydown);
    voiceModeBtn.focus();
  }

  voiceModeBtn.addEventListener("click", openVoiceMode);
  voiceModeCloseBtn.addEventListener("click", closeVoiceMode);
  voiceModeOrb.addEventListener("click", handleVoiceOrbTap);

  // ---------------- boot ----------------

  refreshMe();
})();
