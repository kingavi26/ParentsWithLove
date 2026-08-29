const express = require("express");
const { requireAuth } = require("../auth-middleware");
const { transcribeAudio, synthesizeSpeech, isVoiceAvailable } = require("../voice");

const router = express.Router();

// The global express.json() middleware in server.js only parses bodies whose
// Content-Type is application/json, so it silently skips these audio
// requests and leaves the stream untouched for this route-specific raw
// parser to read. `type: () => true` accepts whatever mime type the
// browser's MediaRecorder used (this varies: audio/webm in Chrome,
// audio/mp4 in Safari, etc).
const rawAudio = express.raw({ type: () => true, limit: "10mb" });

router.post("/voice/transcribe", requireAuth, rawAudio, async (req, res) => {
  if (!isVoiceAvailable) {
    return res.status(503).json({
      error: "Voice input needs a real OpenAI connection — this app is running in demo mode."
    });
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "No audio received." });
  }

  try {
    const text = await transcribeAudio(req.body, req.headers["content-type"]);
    res.json({ text: (text || "").trim() });
  } catch (err) {
    console.error("[pwl7] transcription failed:", err);
    res.status(502).json({ error: "Couldn't hear that clearly. Please try again or type your message." });
  }
});

router.post("/voice/speak", requireAuth, async (req, res) => {
  if (!isVoiceAvailable) {
    return res.status(503).json({
      error: "Voice replies need a real OpenAI connection — this app is running in demo mode."
    });
  }
  const text = req.body && req.body.text;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Nothing to read aloud." });
  }

  try {
    // Guard against an unusually long reply running up TTS cost.
    const audioBuffer = await synthesizeSpeech(text.trim().slice(0, 4000));
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (err) {
    console.error("[pwl7] speech synthesis failed:", err);
    res.status(502).json({ error: "Couldn't generate audio right now." });
  }
});

module.exports = router;
