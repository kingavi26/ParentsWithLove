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

  // ---------------- live sources strip ----------------
  // Same /api/sources endpoint public/sources.html already renders from —
  // one source of truth, so this page never hand-maintains a second copy
  // of "who we're grounded in."

  var stripEl = document.getElementById("sources-strip");
  if (stripEl) {
    fetch("/api/sources")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var sources = (data && data.sources) || [];
        if (!sources.length) return;
        var seenOrgs = {};
        var orgs = [];
        sources.forEach(function (s) {
          if (!seenOrgs[s.org]) {
            seenOrgs[s.org] = true;
            orgs.push(s.org);
          }
        });
        stripEl.innerHTML = orgs
          .map(function (org) {
            var pill = document.createElement("span");
            pill.className = "source-pill";
            pill.textContent = org;
            return pill.outerHTML;
          })
          .join("");
      })
      .catch(function () {
        /* Leave the fallback static copy already in the HTML in place. */
      });
  }
})();
