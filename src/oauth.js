// Thin OAuth2 "authorization code" flow helpers for Google and Facebook
// sign-in. Deliberately not using passport/express-session — this reuses
// the app's existing JWT session cookie (see auth-middleware.js) once we
// know who the person is, the same way email/password login already
// works, so there's only ever one kind of session in the app.
//
// Both providers are opt-in and only "available" once their client
// id/secret env vars are set on the server, same convention as
// OPENAI_API_KEY (reply-engine.js) and voice.js — until then the frontend
// simply doesn't show the button.

const crypto = require("crypto");

const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = `${APP_BASE_URL}/api/auth/google/callback`;

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const FACEBOOK_REDIRECT_URI = `${APP_BASE_URL}/api/auth/facebook/callback`;

const isGoogleAvailable = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const isFacebookAvailable = Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET);

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function googleAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function googleExchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // id_token is a signed JWT from Google. We received it directly from
  // Google over a server-to-server HTTPS call (not relayed through the
  // browser), so decoding the payload without re-verifying the signature
  // is safe here — there's no untrusted party in the middle to have
  // forged it.
  const payloadB64 = data.id_token.split(".")[1];
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  return {
    providerId: payload.sub,
    email: payload.email ? String(payload.email).toLowerCase() : null,
    emailVerified: Boolean(payload.email_verified)
  };
}

function facebookAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    state,
    scope: "email,public_profile"
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

async function facebookExchangeCode(code) {
  const tokenParams = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    code
  });
  const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`);
  if (!tokenRes.ok) {
    throw new Error(`Facebook token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { access_token: accessToken } = await tokenRes.json();

  const profileRes = await fetch(
    `https://graph.facebook.com/me?fields=id,email&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!profileRes.ok) {
    throw new Error(`Facebook profile fetch failed: ${profileRes.status} ${await profileRes.text()}`);
  }
  const profile = await profileRes.json();
  return {
    providerId: profile.id,
    // Facebook only includes an email in this response once the person
    // has granted (and Facebook has confirmed) the email permission, so
    // its presence here already implies it's real and owned by them.
    email: profile.email ? String(profile.email).toLowerCase() : null,
    emailVerified: Boolean(profile.email)
  };
}

module.exports = {
  isGoogleAvailable,
  isFacebookAvailable,
  randomState,
  googleAuthorizeUrl,
  googleExchangeCode,
  facebookAuthorizeUrl,
  facebookExchangeCode
};
