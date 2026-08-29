# pwl7 parenting chatbot — backend

A small Node.js/Express app that gives the pwl7 chatbot real accounts and
per-family memory, and calls OpenAI for replies once you add an API key.

## What this does

- **Real login** — email + password, hashed with bcrypt, sessions via an
  HTTP-only signed cookie (JWT). No third-party auth service needed.
- **Per-family memory** — stores children (name/age when known), topics
  already discussed, and free-form notes, one row set per account. Every
  chat reply is generated with those facts folded into the system prompt,
  so the conversation feels continuous across visits without replaying
  the entire chat history back to the model every time.
- **Demo mode by default** — with no `OPENAI_API_KEY` set, chat replies
  come from a small scripted/keyword engine and a regex-based fact
  spotter, so you can fully test login and the memory flow for free.
  Add a key and restart the server to switch on real GPT replies and
  smarter fact extraction — no code changes required.

## Project layout

```
server.js              entry point
src/
  db.js                SQLite schema + connection
  auth-middleware.js    session cookie issue/verify
  prompt.js             the system prompt (EDIT THIS to change how the bot behaves)
  reply-engine.js        demo-mode logic + real OpenAI calls + fact extraction
  routes/
    auth.js             /api/signup, /api/login, /api/logout, /api/me
    chat.js             /api/chat
public/
  index.html, app.js, styles.css   the whole frontend (login + chat + "what we remember")
```

## Run it locally

Requires Node 18+.

```bash
cp .env.example .env
# open .env and set SESSION_SECRET to a long random string
# (leave OPENAI_API_KEY blank for now — see "Going live with OpenAI" below)

npm install
npm start
```

Then open http://localhost:3000, sign up with any email/password (8+
characters), and chat. Log out and back in — it remembers what it
learned about your family.

## Going live with OpenAI

1. Get an API key at https://platform.openai.com/api-keys.
2. Put it in `.env` as `OPENAI_API_KEY=sk-...`.
3. Restart the server. The startup log will say "OPENAI_API_KEY detected —
   replies are live GPT calls" instead of demo mode.

That's it — same login, same stored memory, same code path. The model
used is `gpt-4o-mini` by default; override it with `OPENAI_MODEL` in
`.env` if you want a different one.

**Cost note:** each chat message now makes *two* OpenAI calls — one for
the reply, one small one to extract new facts. Both use the same model
setting. If cost matters, the fact-extraction call is isolated in
`src/reply-engine.js` (`realReply`) and easy to swap for a cheaper model
or a less frequent schedule (e.g. only run it every few messages).

## Editing what the bot is allowed to say

Open `src/prompt.js` — `BASE_RULES` at the top is the entire personality
and rule set (tone, safety redirects, what it should and shouldn't do).
Edit the text directly; nothing else in the app needs to change.

The "what we know about this family" section underneath it is generated
automatically from the database — you don't edit that part directly,
it's built by `buildFamilyContext()` from whatever's actually stored.

## Deploying to Render (included blueprint)

This repo includes a `render.yaml` ("Blueprint") that sets everything up
in one shot:

- a free Node web service (`npm install` / `npm start`)
- a 1GB persistent disk mounted at `/var/data`, with `DB_PATH` pointed at
  it — so `data.sqlite` survives every redeploy instead of resetting
  (see the `DB_PATH` override in `src/db.js`; leave it unset for local
  dev and nothing changes)
- an auto-generated `SESSION_SECRET`
- an `OPENAI_API_KEY` slot, left blank by default (stays in free demo
  mode until you fill it in from the Render dashboard)

Steps: push this repo to GitHub → in Render, "New +" → "Blueprint" →
point it at the repo → Render reads `render.yaml` and provisions it.

Once it's deployed and has a real URL, update the "Try the chatbot
demo" button on the pwl7.wordpress.com **Chat** page (page ID 6) to
point at that URL instead of the current Artifact link.

Railway.app or Fly.io work too (similar env vars), but would need their
own equivalent of the disk + `DB_PATH` setup above to persist data.

## Session self-review ("Rate this session")

After chatting, the parent can click **Rate this session** in the chat header. This sends
the visible conversation to a second, independent OpenAI call that grades the assistant's
OWN replies — both against the framework in `src/prompt.js` (`BASE_RULES`) and against
general child development research (attachment theory, authoritative-parenting research,
emotion-coaching research) — and returns an overall score, per-dimension scores, strengths,
concerns, missed opportunities, and concrete suggested prompt changes. Only available in
real mode (needs `OPENAI_API_KEY`); in demo mode it just explains that a real connection is
needed.

Every review is stored in the `session_reviews` table (see `src/db.js`), so patterns across
many sessions can be reviewed later rather than judging the prompt off one conversation.
`GET /api/admin/reviews` (disabled unless `ADMIN_KEY` is set — see `.env.example`) lists the
most recent 200 reviews across all users, for exactly that purpose: pull them periodically,
look for a concern or suggested change that keeps recurring, and update `BASE_RULES`
accordingly. This is a manual loop by design — nothing auto-edits the prompt, so a bad or
one-off critique can't silently degrade the assistant's behavior for everyone.

## Voice input and voice output

Two independent, optional features, both reusing `OPENAI_API_KEY` (no separate key needed)
and both hidden automatically in demo mode since they can't work without a real key:

- **Voice input** — a microphone button next to the chat input. Click to start recording
  (the browser will ask for microphone permission the first time), click again to stop.
  The recording is sent to `POST /api/voice/transcribe`, which calls OpenAI's Whisper API
  (`TRANSCRIBE_MODEL`, defaults to `whisper-1`) and returns the transcribed text into the
  input box for the parent to review/edit before sending — it does not auto-send, so a
  mis-transcription never reaches the assistant unedited.
- **Voice output** — a "Read replies aloud" toggle in the chat header (remembered per
  browser via `localStorage`). When on, every new assistant reply is sent to
  `POST /api/voice/speak`, which calls OpenAI's text-to-speech API (`TTS_MODEL`, defaults to
  `tts-1`; `TTS_VOICE`, defaults to `alloy`) and plays the returned audio automatically.

Both add a real, paid OpenAI API call per use on top of the existing reply/fact-extraction/
review calls — see `.env.example` for the cost note and the model/voice override variables.
Browser support: the mic button only appears when the browser has both `getUserMedia` and
`MediaRecorder` (all current Chrome/Edge/Safari/Firefox do); the read-aloud toggle works
anywhere `<audio>` playback works, which is effectively everywhere.

## Social login (Google / Facebook)

Optional "Continue with Google" / "Continue with Facebook" buttons on the login screen,
each independently hidden until its own credentials are configured — so leaving both
unset changes nothing about the existing email/password flow.

Both use a plain OAuth2 "authorization code" flow (`src/oauth.js`, `src/routes/social-auth.js`)
rather than a session-management library, so a social sign-in ends up issuing the exact
same JWT cookie a password login does (`src/auth-middleware.js`) — there's only ever one
kind of session in the app.

**Account matching:** signing in finds an existing account by that provider's user id
first; if there isn't one, it looks for an existing account with a matching *verified*
email and links the new provider onto it (so someone who signed up with a password can
later also use "Continue with Google" with the same address); otherwise it creates a
brand-new account with no password. Linking never happens on an unverified email, so a
stranger can't claim someone else's account by typing their email into a throwaway
social profile.

**To turn on Google:**
1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth client ID of type "Web application".
2. Add `{APP_BASE_URL}/api/auth/google/callback` as an authorized redirect URI (e.g.
   `https://pwl7-chatbot.onrender.com/api/auth/google/callback`).
3. Set `APP_BASE_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in `.env` (or your
   host's environment variables). Free — no paid account needed.

**To turn on Facebook:**
1. Create an app at [Facebook for Developers](https://developers.facebook.com/apps) and
   add the "Facebook Login" product.
2. Add `{APP_BASE_URL}/api/auth/facebook/callback` as a valid OAuth redirect URI.
3. Set `APP_BASE_URL`, `FACEBOOK_APP_ID`, and `FACEBOOK_APP_SECRET`. Free, but Meta's app
   review process can take a while before the login works for the public rather than
   just accounts you've added as testers on the app — testers can use it immediately.

**Apple ("Sign in with Apple") is not implemented yet.** It's a meaningfully bigger lift
than Google or Facebook: it requires an active Apple Developer Program membership ($99/
year) and the client "secret" isn't a plain string but a JWT you generate yourself and
re-sign periodically using a private key from Apple. Worth adding once there's an actual
iOS app in the picture (Apple requires it there) or once Avi has confirmed he wants to
pay for the Developer Program for the web-only case.

## Security notes

- Passwords are hashed with bcrypt — never stored in plain text.
- The `OPENAI_API_KEY` never reaches the browser; only this server calls
  OpenAI.
- Set a real, random `SESSION_SECRET` before deploying anywhere real
  users can reach — the app will print a warning on startup if you
  haven't.
- This is a first pass: there's no email verification, password reset,
  or rate limiting yet. Fine for an early prototype; worth adding before
  a wide public launch.
- Social login uses a random per-attempt `state` value stored in a short-lived
  httpOnly cookie to prevent CSRF on the OAuth callback, and never trusts an
  email address as "verified" unless the provider itself confirms it.
