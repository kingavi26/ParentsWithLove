// Voice support: speech-to-text for the mic button, text-to-speech for the
// "read replies aloud" toggle. Both go through OpenAI (Whisper for
// transcription, the TTS API for spoken replies) — real per-call cost on
// the same OpenAI account as the chat/review calls, so both endpoints are
// behind requireAuth and this module is a no-op (returns isVoiceAvailable:
// false) whenever OPENAI_API_KEY isn't set, same convention as reply-engine.js.

const hasRealKey = Boolean(process.env.OPENAI_API_KEY);

let client = null;
let toFile = null;
if (hasRealKey) {
  const OpenAI = require("openai");
  toFile = OpenAI.toFile;
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || "whisper-1";
const TTS_MODEL = process.env.TTS_MODEL || "tts-1";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";

function extFromMimeType(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "mp4";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

async function transcribeAudio(buffer, mimeType) {
  if (!client) {
    const err = new Error("Voice input needs a real OpenAI connection.");
    err.code = "NO_KEY";
    throw err;
  }
  const file = await toFile(buffer, `speech.${extFromMimeType(mimeType)}`, {
    type: mimeType || "audio/webm"
  });
  const result = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    // Without this, Whisper auto-detects the spoken language from the audio
    // and can misfire on short or unclear clips — mis-transcribing ordinary
    // English speech as another language entirely (seen in testing: it
    // returned Arabic text for an English utterance). The rest of the app
    // (UI copy, index.html's lang="en", GPT's reply, TTS voice) is
    // English-only, so pin transcription to English rather than trusting
    // auto-detection.
    language: process.env.TRANSCRIBE_LANGUAGE || "en"
  });
  return result.text;
}

async function synthesizeSpeech(text) {
  if (!client) {
    const err = new Error("Voice replies need a real OpenAI connection.");
    err.code = "NO_KEY";
    throw err;
  }
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    response_format: "mp3"
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { transcribeAudio, synthesizeSpeech, isVoiceAvailable: hasRealKey };
