import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

// The login cookies. Page JavaScript can't read any of them (httpOnly), and none holds a key.
const ACCESS = 'lifeos_access'; // access token, sent everywhere, lasts as long as the token (1 hour)
const REFRESH = 'lifeos_refresh'; // refresh token, only sent to /api, lasts 30 days
const PKCE = 'lifeos_pkce'; // PKCE verifier for an email link, only sent to /api/auth, lasts 1 hour
const PATHS = { [ACCESS]: '/', [REFRESH]: '/api', [PKCE]: '/api/auth' };
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Lax still sends the cookies when the user clicks an email link (a normal top-level visit),
// but not when another website submits a form to LifeOS. Secure (HTTPS only) in production.
const options = (name, maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: PATHS[name],
  ...(maxAge && { maxAge }),
});

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSession(res, session) {
  res.cookie(ACCESS, session.access_token, options(ACCESS, session.expires_in * 1000));
  res.cookie(REFRESH, session.refresh_token, options(REFRESH, THIRTY_DAYS));
}

export function clearSession(res) {
  res.clearCookie(ACCESS, options(ACCESS));
  res.clearCookie(REFRESH, options(REFRESH));
}

// The signed-in user from the access cookie, or null. getClaims checks the token's signature and
// expiry; a network failure is thrown so the user sees "can't reach the database", not "sign in".
export async function currentUser(req) {
  const token = readCookie(req, ACCESS);
  if (!token) return null;
  const { data, error } = await supabase.auth.getClaims(token);
  if (error && isAuthRetryableFetchError(error)) throw error;
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: data.claims.email };
}

// After sign-up the login client has written its PKCE verifier into its store, under a key
// like "lifeos-flow-<id>-code-verifier". Keep exactly that entry in the verifier cookie.
const VERIFIER_KEY = /^lifeos-flow-([0-9a-f]{32})-code-verifier$/;

export function savePkce(res, store) {
  for (const [key, value] of store) {
    const match = VERIFIER_KEY.exec(key);
    if (!match) continue;
    const packed = Buffer.from(JSON.stringify({ key, value, flowId: match[1] })).toString('base64url');
    res.cookie(PKCE, packed, options(PKCE, ONE_HOUR));
  }
}

// The verifier saved by savePkce, or null if it's missing or not ours. The cookie is always
// deleted: a link can only be used once.
export function takePkce(req, res) {
  const packed = readCookie(req, PKCE);
  res.clearCookie(PKCE, options(PKCE));
  if (!packed) return null;
  try {
    const { key, value, flowId } = JSON.parse(Buffer.from(packed, 'base64url').toString());
    const match = VERIFIER_KEY.exec(key);
    if (!match || match[1] !== flowId || typeof value !== 'string') return null;
    return { key, value, flowId };
  } catch {
    return null;
  }
}
