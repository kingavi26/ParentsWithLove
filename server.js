require("dotenv").config();

const express = require("express");
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
const { isDemoMode } = require("./src/reply-engine");
const { isVoiceAvailable } = require("./src/voice");
const { isGoogleAvailable, isFacebookAvailable } = require("./src/oauth");

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most hosts) put the app behind a reverse proxy, so without
// this, req.ip/req.secure would reflect the proxy, not the real visitor —
// which would make IP-based rate limiting (src/rate-limit.js) key everyone
// to the same bucket and silently do nothing. `1` trusts exactly one hop
// (the platform's own proxy), which matches Render's setup.
app.set("trust proxy", 1);

initDb();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", authRoutes);
app.use("/api", accountRoutes);
app.use("/api", chatRoutes);
app.use("/api", reviewRoutes);
app.use("/api", voiceRoutes);
app.use("/api", socialAuthRoutes);
app.use("/api", adminRoutes);

// Unauthenticated — lets the frontend show a "demo mode" banner before login.
app.get("/api/status", (req, res) => {
  res.json({
    demoMode: isDemoMode,
    voiceAvailable: isVoiceAvailable,
    googleLoginAvailable: isGoogleAvailable,
    facebookLoginAvailable: isFacebookAvailable
  });
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
