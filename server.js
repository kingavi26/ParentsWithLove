require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");

const { initDb } = require("./src/db");
const authRoutes = require("./src/routes/auth");
const accountRoutes = require("./src/routes/account");
const chatRoutes = require("./src/routes/chat");
const reviewRoutes = require("./src/routes/review");
const voiceRoutes = require("./src/routes/voice");
const socialAuthRoutes = require("./src/routes/social-auth");
const adminRoutes = require("./src/routes/admin");
const designRoutes = require("./src/routes/design");
const betaRoutes = require("./src/routes/beta");
const { isDemoMode } = require("./src/reply-engine");
const { isVoiceAvailable } = require("./src/voice");
const { isGoogleAvailable, isFacebookAvailable } = require("./src/oauth");
const { allSources } = require("./src/research-sources");

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most hosts) put the app behind a reverse proxy, so without
// this, req.ip/req.secure would reflect the proxy, not the real visitor —
// which would make IP-based rate limiting (src/rate-limit.js) key everyone
// to the same bucket and silently do nothing. `1` trusts exactly one hop
// (the platform's own proxy), which matches Render's setup.
app.set("trust proxy", 1);

initDb();

// Baseline HTTP security headers (X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Referrer-Policy, etc.), plus a Content-Security
// Policy scoped to what this app actually loads: everything is same-origin
// (no CDNs, no Google Fonts, no third-party embeds — see public/*.html), so
// script-src can stay locked to 'self' with no 'unsafe-inline'/'unsafe-eval'.
// style-src keeps 'unsafe-inline' for the small number of static inline
// style="" attributes still in public/admin.html and public/index.html
// (none of them render user-supplied data) and for the live Design Mode
// theme editor (src/design.js, public/design.js), which previews color/
// spacing changes by writing CSS custom properties onto the page.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"]
      }
    },
    // The Android TWA wrapper (see the assetlinks.json route below) needs
    // this app's own assets embeddable/fetchable from that shell; leaving
    // COEP/CORP at helmet's cross-origin-isolating defaults broke that in
    // testing, and nothing here depends on cross-origin isolation.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  })
);

app.use(express.json());
app.use(cookieParser());
// express.static ignores dotfiles/dot-directories by default (serve-static's
// `dotfiles: "ignore"`), which would silently 404 /.well-known/* — so this
// needs its own route rather than just dropping the file in public/.
// Required for the Android TWA app to verify it owns this site (Digital
// Asset Links) and open without a browser URL bar.
app.get("/.well-known/assetlinks.json", (req, res) => {
    res.sendFile(path.join(__dirname, "public", ".well-known", "assetlinks.json"));
});

// public/index.html is now the pre-launch beta-signup landing page, not the
// product — the actual login/chat app lives at public/app.html and is
// served here under a clean extensionless URL (this is also what
// manifest.json's start_url/scope point at, so the installed PWA/Android
// TWA opens straight into the app rather than the marketing page).
app.get("/app", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.use("/api", authRoutes);
app.use("/api", accountRoutes);
app.use("/api", chatRoutes);
app.use("/api", reviewRoutes);
app.use("/api", voiceRoutes);
app.use("/api", socialAuthRoutes);
app.use("/api", adminRoutes);
app.use("/api", designRoutes);
app.use("/api", betaRoutes);

// Unauthenticated — lets the frontend show a "demo mode" banner before login.
app.get("/api/status", (req, res) => {
  res.json({
    demoMode: isDemoMode,
    voiceAvailable: isVoiceAvailable,
    googleLoginAvailable: isGoogleAvailable,
    facebookLoginAvailable: isFacebookAvailable
  });
});

// Unauthenticated, static, and public on purpose — this is the same fixed
// library that reply-engine.js tags individual chat replies from (see
// src/research-sources.js), served here so public/sources.html can render
// the full list from one source of truth instead of a second hand-kept copy.
app.get("/api/sources", (req, res) => {
  res.json({ sources: allSources() });
});

app.listen(PORT, () => {
  console.log(`pwl7 chatbot server listening on http://localhost:${PORT}`);
  if (isDemoMode) {
    console.log(
      "Running in scripted DEMO_MODE (no OPENAI_API_KEY set). Login and the " +
        "personalization/memory flow are fully real; chat replies are canned " +
        "until you add a key to .env — see .env.example."
    );
  } else {
    console.log("OPENAI_API_KEY detected — replies are live GPT calls.");
  }
});
