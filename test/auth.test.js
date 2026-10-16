import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';

// ---------- A fake Supabase Auth: accounts, sessions and the PKCE check ----------

const PASSWORD = 'correct horse battery';
const users = new Map(); // email -> { id, email, password, confirmed }
const challenges = new Map(); // email -> code_challenge from the latest sign-up
const codes = new Map(); // one-time code from an email link -> email
const tokens = new Map(); // access token -> user
const calls = []; // every request the server made, for checks

const b64url = (s) => Buffer.from(s).toString('base64url');
function makeToken(user, expiresIn = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const token = [
    b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    b64url(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + expiresIn })),
    b64url('signature'),
  ].join('.');
  tokens.set(token, user);
  return token;
}
const publicUser = (u) => ({ id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = (u) => ({
  access_token: makeToken(u),
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: randomUUID(),
  user: publicUser(u),
});
const fail = (res, status, error_code, msg) => {
  res.statusCode = status;
  res.end(JSON.stringify({ code: status, error_code, msg }));
};

const fakeAuth = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/auth/v1/signup') {
      if (body.password.length < 8) return fail(res, 422, 'weak_password', 'Password should be at least 8 characters.');
      challenges.set(body.email, body.code_challenge);
      const known = users.get(body.email);
      if (!known) users.set(body.email, { id: randomUUID(), email: body.email, password: body.password, confirmed: false });
      // Like Supabase with "Confirm email" on: the same answer whether or not the email is known
      return res.end(JSON.stringify(publicUser(known ?? users.get(body.email))));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return fail(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return fail(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return res.end(JSON.stringify(session(u)));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const email = codes.get(body.auth_code);
      codes.delete(body.auth_code); // one-time
      const expected = challenges.get(email);
      const actual = body.code_verifier && createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!email || !expected || actual !== expected) return fail(res, 400, 'bad_code_verifier', 'code challenge does not match previously saved code verifier');
      const u = users.get(email);
      u.confirmed = true;
      return res.end(JSON.stringify(session(u)));
    }
    if (url.pathname === '/auth/v1/user') {
      const u = tokens.get((req.headers.authorization ?? '').replace('Bearer ', ''));
      if (!u) return fail(res, 403, 'bad_jwt', 'invalid JWT');
      return res.end(JSON.stringify(publicUser(u)));
    }
    fail(res, 404, 'not_found', 'no such endpoint in the fake');
  });
});

// "The user clicks the link in the email": Supabase checks it and hands out a one-time code
function emailLinkCode(email) {
  const code = randomUUID();
  codes.set(code, email);
  return code;
}

// ---------- Our server, wired like server/index.js ----------

let base;
let server;
let resetLimits;
const logs = []; // everything the server writes to its log
const realConsole = { log: console.log, error: console.error, warn: console.warn };

before(async () => {
  await new Promise((r) => fakeAuth.listen(0, '127.0.0.1', r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeAuth.address().port}`;
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  const auth = await import('../server/routes/auth.js');
  const authRouter = auth.default;
  resetLimits = auth.resetLimits;
  const { sameOriginWrites } = await import('../server/host.js');
  const { friendlyError } = await import('../server/errors.js');
  const app = express()
    .use(sameOriginWrites)
    .use(express.json())
    .use('/api/auth', authRouter)
    .post('/api/anything', (req, res) => res.json({ ok: true }))
    .use((err, req, res, next) => {
      console.error(err);
      const { status, message } = friendlyError(err);
      res.status(status).json({ error: message });
    });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const k of Object.keys(realConsole)) console[k] = (...args) => logs.push(args.map(String).join(' '));
});
after(() => {
  Object.assign(console, realConsole);
  server?.close();
  fakeAuth.close();
});
beforeEach(() => {
  calls.length = 0;
  resetLimits();
});

// ---------- Helpers ----------

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });
const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });

// Set-Cookie headers -> { name: { value, attrs } }
function cookiesOf(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const i = pair.indexOf('=');
    out[pair.slice(0, i)] = { value: pair.slice(i + 1), attrs: attrs.map((a) => a.toLowerCase()) };
  }
  return out;
}
const cookieHeader = (cookies) => Object.entries(cookies).map(([k, c]) => `${k}=${c.value}`).join('; ');
let emailCounter = 0;
const newEmail = () => `student${++emailCounter}@example.com`;

async function signUpAndConfirm(email = newEmail()) {
  const signup = await post('/api/auth/signup', { email, password: PASSWORD });
  const pkce = cookiesOf(signup).lifeos_pkce;
  const res = await get(`/api/auth/callback?code=${emailLinkCode(email)}`, { cookie: `lifeos_pkce=${pkce.value}` });
  return { email, res, cookies: cookiesOf(res) };
}

// ---------- Sign-up ----------

test('sign-up asks Supabase to send the confirm email back to our callback, in PKCE mode', async () => {
  const email = newEmail();
  const res = await post('/api/auth/signup', { email: `  ${email.toUpperCase()} `, password: PASSWORD });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: 'Check your email to confirm your account.' });
  const call = calls.find((c) => c.path === '/auth/v1/signup');
  assert.equal(call.body.email, email, 'email is trimmed and lower-cased');
  assert.equal(call.query.redirect_to, `${base}/api/auth/callback?next=/`);
  assert.equal(call.body.code_challenge_method, 's256');
  assert.ok(call.body.code_challenge);
});

test('sign-up keeps the PKCE verifier in an httpOnly cookie only sent to /api/auth', async () => {
  const res = await post('/api/auth/signup', { email: newEmail(), password: PASSWORD });
  const { lifeos_pkce } = cookiesOf(res);
  assert.ok(lifeos_pkce, 'verifier cookie is set');
  assert.ok(lifeos_pkce.attrs.includes('httponly'));
  assert.ok(lifeos_pkce.attrs.includes('path=/api/auth'));
  assert.ok(lifeos_pkce.attrs.includes('samesite=lax'));
  assert.ok(!(await res.text()).includes(lifeos_pkce.value), 'the verifier is not in the response body');
});

test('sign-up gives the same answer for an email that already has an account', async () => {
  const { email } = await signUpAndConfirm();
  const again = await post('/api/auth/signup', { email, password: 'some other password' });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { message: 'Check your email to confirm your account.' });
});

test('sign-up refuses a bad email or a password outside 8 to 72 bytes', async () => {
  for (const body of [
    { email: 'not-an-email', password: PASSWORD },
    { email: 'a@b', password: PASSWORD },
    { email: newEmail(), password: 'short' },
    { email: newEmail(), password: 'x'.repeat(73) },
    { email: newEmail(), password: 'é'.repeat(37) }, // 74 bytes
    { email: `${'x'.repeat(250)}@example.com`, password: PASSWORD },
    {},
  ]) {
    const res = await post('/api/auth/signup', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(calls.filter((c) => c.path === '/auth/v1/signup').length, 0, 'nothing bad reaches Supabase');
});

// ---------- The email link (callback) ----------

test('a good email link signs the user in, removes the verifier and goes to Home', async () => {
  const { res, cookies } = await signUpAndConfirm();
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  assert.ok(cookies.lifeos_access?.value, 'access cookie set');
  assert.ok(cookies.lifeos_refresh?.value, 'refresh cookie set');
  assert.ok(cookies.lifeos_pkce.attrs.some((a) => a.startsWith('expires=thu, 01 jan 1970')), 'verifier cookie deleted');
});

test('the email link only works with the verifier cookie from the browser that signed up', async () => {
  const email = newEmail();
  await post('/api/auth/signup', { email, password: PASSWORD });
  const otherBrowser = await get(`/api/auth/callback?code=${emailLinkCode(email)}`);
  assert.equal(otherBrowser.status, 302);
  assert.equal(otherBrowser.headers.get('location'), '/signin?link=signup');
  assert.equal(cookiesOf(otherBrowser).lifeos_access, undefined, 'not signed in');
});

test('a wrong verifier, a used code, a missing code or an error from Supabase goes to sign-in with a message', async () => {
  const email = newEmail();
  const signup = await post('/api/auth/signup', { email, password: PASSWORD });
  const pkce = cookiesOf(signup).lifeos_pkce.value;
  const otherSignup = await post('/api/auth/signup', { email: newEmail(), password: PASSWORD });
  const wrongPkce = cookiesOf(otherSignup).lifeos_pkce.value;

  const code = emailLinkCode(email);
  const cases = [
    [`/api/auth/callback?code=${code}`, wrongPkce], // someone else's verifier
    [`/api/auth/callback?code=${randomUUID()}`, pkce], // a code Supabase never issued (or already used)
    ['/api/auth/callback', pkce], // no code
    ['/api/auth/callback?error=access_denied&error_code=otp_expired', pkce],
    [`/api/auth/callback?code=${code}`, 'not-a-real-cookie'],
  ];
  for (const [path, cookie] of cases) {
    const res = await get(path, { cookie: `lifeos_pkce=${cookie}` });
    assert.equal(res.headers.get('location'), '/signin?link=signup', path);
    assert.equal(cookiesOf(res).lifeos_access, undefined, path);
  }
});

test('the callback never sends anyone to another website', async () => {
  const email = newEmail();
  for (const next of ['https://evil.example', '//evil.example', '/reset', 'javascript:alert(1)']) {
    const signup = await post('/api/auth/signup', { email, password: PASSWORD });
    const pkce = cookiesOf(signup).lifeos_pkce.value;
    const res = await get(`/api/auth/callback?code=${emailLinkCode(email)}&next=${encodeURIComponent(next)}`, { cookie: `lifeos_pkce=${pkce}` });
    assert.equal(res.headers.get('location'), '/', next);
  }
});

// ---------- Sign-in, me, sign-out ----------

test('sign-in sets two httpOnly cookies with the right paths, and no token in the body', async () => {
  const { email } = await signUpAndConfirm();
  const res = await post('/api/auth/signin', { email, password: PASSWORD });
  assert.equal(res.status, 200);
  const body = await res.text();
  const { lifeos_access, lifeos_refresh } = cookiesOf(res);
  for (const [cookie, path] of [[lifeos_access, 'path=/'], [lifeos_refresh, 'path=/api']]) {
    assert.ok(cookie.attrs.includes('httponly'));
    assert.ok(cookie.attrs.includes('samesite=lax'));
    assert.ok(cookie.attrs.includes(path));
    assert.ok(!cookie.attrs.includes('secure'), 'no Secure flag on http://localhost');
    assert.ok(!body.includes(cookie.value), 'token not in the body');
  }
  assert.ok(lifeos_refresh.attrs.includes(`max-age=${30 * 24 * 60 * 60}`), 'refresh cookie lasts 30 days');
  assert.ok(lifeos_access.attrs.includes('max-age=3600'), 'access cookie lasts as long as the token');
});

test('in production the cookies are also Secure', async () => {
  const { email } = await signUpAndConfirm();
  process.env.NODE_ENV = 'production';
  try {
    const res = await post('/api/auth/signin', { email, password: PASSWORD });
    for (const c of Object.values(cookiesOf(res))) assert.ok(c.attrs.includes('secure'));
  } finally {
    delete process.env.NODE_ENV;
  }
});

test('a wrong password and an unknown email get exactly the same answer', async () => {
  const { email } = await signUpAndConfirm();
  const wrong = await post('/api/auth/signin', { email, password: 'wrong password!' });
  const unknown = await post('/api/auth/signin', { email: newEmail(), password: PASSWORD });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test('signing in before confirming the email says to open the link', async () => {
  const email = newEmail();
  await post('/api/auth/signup', { email, password: PASSWORD });
  const res = await post('/api/auth/signin', { email, password: PASSWORD });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /confirm your email/i);
});

test('the 6th failed sign-in for an email within 15 minutes gets 429, even with the right password', async () => {
  const { email } = await signUpAndConfirm();
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/signin', { email, password: 'wrong password!' })).status, 401);
  assert.equal((await post('/api/auth/signin', { email, password: 'wrong password!' })).status, 429);
  assert.equal((await post('/api/auth/signin', { email, password: PASSWORD })).status, 429);
});

test('the 6th sign-up from one address within an hour gets 429', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/signup', { email: newEmail(), password: PASSWORD })).status, 200);
  assert.equal((await post('/api/auth/signup', { email: newEmail(), password: PASSWORD })).status, 429);
});

test('a successful sign-in clears that email\'s failed attempts', async () => {
  const { email } = await signUpAndConfirm();
  for (let i = 0; i < 4; i++) await post('/api/auth/signin', { email, password: 'wrong password!' });
  assert.equal((await post('/api/auth/signin', { email, password: PASSWORD })).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await post('/api/auth/signin', { email, password: 'wrong password!' })).status, 401);
});

test('me answers with the signed-in user, and 401 without a valid session', async () => {
  const { email, cookies } = await signUpAndConfirm();
  const me = await get('/api/auth/me', { cookie: cookieHeader(cookies) });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, email);

  assert.equal((await get('/api/auth/me')).status, 401);
  assert.equal((await get('/api/auth/me', { cookie: 'lifeos_access=made.up.token' })).status, 401);
  const expired = makeToken(users.get(email), -60);
  assert.equal((await get('/api/auth/me', { cookie: `lifeos_access=${expired}` })).status, 401);
});

test('sign-out clears both session cookies', async () => {
  const { cookies } = await signUpAndConfirm();
  const res = await post('/api/auth/signout', {}, { cookie: cookieHeader(cookies) });
  assert.equal(res.status, 204);
  const cleared = cookiesOf(res);
  for (const name of ['lifeos_access', 'lifeos_refresh']) {
    assert.ok(cleared[name].attrs.some((a) => a.startsWith('expires=thu, 01 jan 1970')), name);
  }
});

// ---------- Guarding ----------

test('a request that changes data from another website gets 403', async () => {
  const evil = await post('/api/auth/signin', { email: newEmail(), password: PASSWORD }, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal((await post('/api/anything', {}, { origin: 'null' })).status, 403);
  assert.equal((await post('/api/anything', {}, { origin: base })).status, 200, 'our own pages are fine');
  assert.equal((await get('/api/auth/me', { origin: 'https://evil.example' })).status, 401, 'reads are not blocked, only writes');
});

test('passwords never appear in the server log', async () => {
  logs.length = 0;
  const secret = 'never-log-this-password';
  await post('/api/auth/signup', { email: newEmail(), password: secret });
  await post('/api/auth/signin', { email: newEmail(), password: secret });
  await post('/api/auth/signin', { email: 'bad', password: secret });
  assert.ok(!logs.join('\n').includes(secret));
});
