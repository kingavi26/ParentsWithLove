(function () {
  "use strict";

  var authScreen = document.getElementById("auth-screen");
  var appScreen = document.getElementById("app-screen");
  var authForm = document.getElementById("auth-form");
  var authError = document.getElementById("auth-error");
  var authSubmit = document.getElementById("auth-submit");
  var authTabs = document.querySelectorAll(".auth-tab");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");

  var demoBanner = document.getElementById("demo-banner");
  var accountEmail = document.getElementById("account-email");
  var logoutBtn = document.getElementById("logout-btn");
  var chatSubtitle = document.getElementById("chat-subtitle");

  var chatLog = document.getElementById("chat-log");
  var chatForm = document.getElementById("chat-form");
  var chatInput = document.getElementById("chat-input");
  var chatSend = document.getElementById("chat-send");

  var memoryChildren = document.getElementById("memory-children");
  var memoryTopics = document.getElementById("memory-topics");
  var memoryNotes = document.getElementById("memory-notes");

  var authMode = "login"; // or "signup"
  var conversation = []; // { role: 'user' | 'assistant', content: string } — this browser tab's session only

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
    })
    .catch(function () {});

  // ---------------- app screen ----------------

  function enterApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    conversation = [];
    chatLog.innerHTML = "";
    refreshMe();
  }

  function refreshMe() {
    fetch("/api/me")
      .then(function (res) {
        if (!res.ok) throw new Error("not logged in");
        return res.json();
      })
      .then(function (data) {
        accountEmail.textContent = data.email;
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

  function greet(data) {
    var hasHistory = data.children.length || data.topics_discussed.length || data.notes.length;
    var text = hasHistory
      ? "Welcome back! I remember a bit about your family already — feel free to keep going, or ask something new."
      : "Hi! I'm the parenting help chatbot. Tell me what's going on, or ask about tantrums, screen time, bedtime, or sibling conflict.";
    addMessage(text, "bot");
  }

  function renderMemory(data) {
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
        chip.textContent = t;
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
        item.textContent = n;
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
      })
      .catch(function () {
        pending.remove();
        chatInput.disabled = false;
        chatSend.disabled = false;
        addMessage("Couldn't reach the server. Please try again.", "bot");
      });
  });

  // ---------------- boot ----------------

  refreshMe();
})();
