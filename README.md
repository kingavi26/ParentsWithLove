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
