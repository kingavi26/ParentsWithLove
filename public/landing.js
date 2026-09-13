(function () {
  "use strict";

  // ---------------- hero video ----------------
  // The hero banner is a short looping video (see the `poster` attribute for
  // the static-image fallback). Autoplay is started from JS, not the HTML
  // `autoplay` attribute, so a visitor with prefers-reduced-motion set never
  // sees it start playing even for a frame — they just get the poster image.
  var heroVideo = document.getElementById("hero-video");
  if (heroVideo) {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      var playPromise = heroVideo.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function () {
          /* Autoplay blocked by the browser — the poster image still shows. */
        });
      }
    }
  }

  // ---------------- signup forms ----------------
  // Two forms on the page (hero + bottom CTA) share this same handler.

  function wireSignupForm(form) {
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    var btn = form.querySelector(".signup-btn");
    var feedback = form.parentElement.querySelector(".signup-feedback");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!email) return;

      btn.disabled = true;
      var originalLabel = btn.textContent;
      btn.textContent = "Joining…";
      if (feedback) {
        feedback.textContent = "";
        feedback.className = "signup-feedback";
      }

      fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          btn.disabled = false;
          btn.textContent = originalLabel;

          if (!result.ok) {
            if (feedback) {
              feedback.textContent = (result.data && result.data.error) || "Something went wrong. Please try again.";
              feedback.className = "signup-feedback is-error";
            }
            return;
          }

          form.reset();
          if (feedback) {
            feedback.textContent = result.data.alreadyOnList
              ? "You're already on the list — we'll email you when beta access opens."
              : "You're on the list! We'll email you when beta access opens.";
            feedback.className = "signup-feedback is-success";
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = originalLabel;
          if (feedback) {
            feedback.textContent = "Something went wrong. Please try again.";
            feedback.className = "signup-feedback is-error";
          }
        });
    });
  }

  document.querySelectorAll(".signup-form").forEach(wireSignupForm);

  // ---------------- "Other" card: free-text issue submission ----------------

  var otherIssueForm = document.getElementById("other-issue-form");
  if (otherIssueForm) {
    var otherIssueTextarea = document.getElementById("other-issue-text");
    var otherIssueBtn = otherIssueForm.querySelector(".other-issue-btn");
    var otherIssueFeedback = otherIssueForm.parentElement.querySelector(".other-issue-feedback");
    var otherIssueResult = document.getElementById("other-issue-result");

    otherIssueForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (otherIssueTextarea.value || "").trim();
      if (!text) return;

      otherIssueBtn.disabled = true;
      var originalLabel = otherIssueBtn.textContent;
      otherIssueBtn.textContent = "Asking…";
      if (otherIssueFeedback) {
        otherIssueFeedback.textContent = "";
        otherIssueFeedback.className = "other-issue-feedback";
      }

      fetch("/api/other-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          otherIssueBtn.disabled = false;
          otherIssueBtn.textContent = originalLabel;

          if (!result.ok) {
            if (otherIssueFeedback) {
              otherIssueFeedback.textContent = (result.data && result.data.error) || "Something went wrong. Please try again.";
              otherIssueFeedback.className = "other-issue-feedback is-error";
            }
            return;
          }

          if (otherIssueResult && result.data && result.data.reply) {
            var questionBubble = document.createElement("div");
            questionBubble.className = "chat-bubble from-parent";
            questionBubble.textContent = text;

            var replyBubble = document.createElement("div");
            replyBubble.className = "chat-bubble from-app";
            replyBubble.textContent = result.data.reply;

            otherIssueResult.innerHTML = "";
            otherIssueResult.appendChild(questionBubble);
            otherIssueResult.appendChild(replyBubble);

            var sources = result.data.sources || [];
            if (sources.length) {
              var sourcesLine = document.createElement("p");
              sourcesLine.className = "other-issue-sources";
              sourcesLine.textContent = "Grounded in: " + sources.map(function (s) { return s.org; }).join(", ");
              otherIssueResult.appendChild(sourcesLine);
            }

            otherIssueResult.hidden = false;
          }

          otherIssueForm.reset();
          if (otherIssueFeedback) {
            otherIssueFeedback.textContent = "";
            otherIssueFeedback.className = "other-issue-feedback";
          }
        })
        .catch(function () {
          otherIssueBtn.disabled = false;
          otherIssueBtn.textContent = originalLabel;
          if (otherIssueFeedback) {
            otherIssueFeedback.textContent = "Something went wrong. Please try again.";
            otherIssueFeedback.className = "other-issue-feedback is-error";
          }
        });
    });
  }

  // ---------------- live sources grid ----------------
  // Same /api/sources endpoint public/sources.html already renders from —
  // one source of truth, so this page never hand-maintains a second copy
  // of "who we're grounded in." Each card shows the organization's real
  // logo (the `logo` field in src/research-sources.js, captured directly
  // from that org's own live site) rather than the original invented
  // monogram badge. Pairing real trademarked marks with pwl7's own brand
  // can look like a formal endorsement/partnership that doesn't exist, so
  // the section carries a small disclaimer (`.sources-disclaimer` in
  // index.html) making clear these are referenced sources, not partners.
  // If a logo image ever fails to load, fall back to the legacy monogram
  // text so the card never shows a broken image.

  var gridEl = document.getElementById("sources-grid");
  if (gridEl) {
    fetch("/api/sources")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var sources = (data && data.sources) || [];
        if (!sources.length) return;
        var seenOrgs = {};
        var cards = [];
        sources.forEach(function (s) {
          if (seenOrgs[s.org]) return;
          seenOrgs[s.org] = true;
          var card = document.createElement("a");
          card.className = "source-card";
          card.href = s.url;
          card.target = "_blank";
          card.rel = "noopener";

          if (s.logo) {
            var logo = document.createElement("img");
            logo.className = "source-logo";
            logo.src = s.logo;
            logo.alt = s.org + " logo";
            logo.loading = "lazy";
            logo.onerror = function () {
              var fallback = document.createElement("span");
              fallback.className = "source-badge";
              fallback.setAttribute("aria-hidden", "true");
              fallback.textContent = s.monogram || s.org.slice(0, 3).toUpperCase();
              logo.replaceWith(fallback);
            };
            card.appendChild(logo);
          } else {
            var badge = document.createElement("span");
            badge.className = "source-badge";
            badge.setAttribute("aria-hidden", "true");
            badge.textContent = s.monogram || s.org.slice(0, 3).toUpperCase();
            card.appendChild(badge);
          }

          var name = document.createElement("span");
          name.className = "source-name";
          name.textContent = s.org;
          card.appendChild(name);

          if (s.title) {
            var title = document.createElement("span");
            title.className = "source-title";
            title.textContent = s.title;
            card.appendChild(title);
          }

          cards.push(card);
        });
        gridEl.innerHTML = "";
        cards.forEach(function (card) { gridEl.appendChild(card); });
      })
      .catch(function () {
        /* Leave the fallback static copy already in the HTML in place. */
      });
  }
})();
