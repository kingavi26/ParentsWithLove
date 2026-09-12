(function () {
  "use strict";

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

  // ---------------- live sources grid ----------------
  // Same /api/sources endpoint public/sources.html already renders from —
  // one source of truth, so this page never hand-maintains a second copy
  // of "who we're grounded in." Each card uses an original monogram badge
  // (see the `monogram` field in src/research-sources.js), never a scraped
  // copy of an organization's actual trademarked logo — real orgs' guidance
  // informs pwl7's answers, but showing their real marks here would wrongly
  // imply a formal endorsement/partnership.

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

          var badge = document.createElement("span");
          badge.className = "source-badge";
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = s.monogram || s.org.slice(0, 3).toUpperCase();
          card.appendChild(badge);

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
