// Thin outbound email + SMS senders, shared by any feature that needs to
// reach a user outside the app itself (password reset and signup
// verification today; account alerts, admin notices, etc. later — that's
// why this is its own generic module rather than living inside auth.js).
//
// Same "opt-in via env vars" convention as oauth.js and voice.js: each
// channel is only "available" once its provider credentials are set, and
// sending through an unconfigured channel never throws — it logs what
// *would* have been sent (mirrors reply-engine.js's DEMO_MODE) so the rest
// of the app (signup, password reset) keeps working end-to-end in local
// dev/demo without real credentials, and a misconfigured env var degrades
// to a log line instead of a 500.
//
// Email: Resend (https://resend.com) — chosen over SMTP because it's a
// plain HTTPS POST with no extra npm dependency (uses the built-in fetch,
// Node 20+), a generous free tier, and good deliverability out of the box.
// SMS: Twilio — the standard here; also a plain HTTPS POST, no SDK needed.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

const isEmailAvailable = Boolean(RESEND_API_KEY && EMAIL_FROM);
const isSmsAvailable = Boolean(
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID)
);

if (!isEmailAvailable) {
  console.warn(
    "[pwl7] Email sending isn't configured (RESEND_API_KEY/EMAIL_FROM unset) — " +
      "verification/reset emails will be logged to the console instead of sent. See .env.example."
  );
}
if (!isSmsAvailable) {
  console.warn(
    "[pwl7] SMS sending isn't configured (TWILIO_* unset) — text notifications " +
      "will be logged to the console instead of sent. See .env.example."
  );
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text] - defaults to a plain-text strip of html if omitted
 * @returns {Promise<{sent: boolean, id?: string, error?: string}>} never rejects
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) {
    console.error("[pwl7] sendEmail called with missing to/subject/html — not sending.");
    return { sent: false, error: "missing_fields" };
  }

  if (!isEmailAvailable) {
    console.log(`[pwl7] DEMO EMAIL to ${to} — "${subject}"\n${text || html.replace(/<[^>]+>/g, " ")}`);
    return { sent: false, error: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, " ")
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[pwl7] Resend email send failed (${res.status}): ${body}`);
      return { sent: false, error: `resend_${res.status}` };
    }

    const data = await res.json().catch(() => ({}));
    return { sent: true, id: data.id };
  } catch (err) {
    console.error("[pwl7] Resend email send threw:", err);
    return { sent: false, error: "exception" };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.to - E.164 phone number, e.g. "+13105551234"
 * @param {string} opts.body
 * @returns {Promise<{sent: boolean, id?: string, error?: string}>} never rejects
 */
async function sendText({ to, body }) {
  if (!to || !body) {
    console.error("[pwl7] sendText called with missing to/body — not sending.");
    return { sent: false, error: "missing_fields" };
  }

  if (!isSmsAvailable) {
    console.log(`[pwl7] DEMO TEXT to ${to} — "${body}"`);
    return { sent: false, error: "not_configured" };
  }

  try {
    const params = new URLSearchParams({ To: to, Body: body });
    if (TWILIO_MESSAGING_SERVICE_SID) {
      params.set("MessagingServiceSid", TWILIO_MESSAGING_SERVICE_SID);
    } else {
      params.set("From", TWILIO_FROM_NUMBER);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[pwl7] Twilio text send failed (${res.status}):`, data.message || data);
      return { sent: false, error: `twilio_${res.status}` };
    }

    return { sent: true, id: data.sid };
  } catch (err) {
    console.error("[pwl7] Twilio text send threw:", err);
    return { sent: false, error: "exception" };
  }
}

module.exports = { sendEmail, sendText, isEmailAvailable, isSmsAvailable };
