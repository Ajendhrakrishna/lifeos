import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// ---------- A fake Supabase: rows per table with the filters our queries use, plus auth ----------

const A = { id: randomUUID(), email: 'a@example.com' };
const B = { id: randomUUID(), email: 'b@example.com' };
const db = { tasks: [], expenses: [], budgets: [] };
const tokens = new Map(); // access token -> user
const refreshTokens = new Map(); // refresh token -> user (each works once, like Supabase's rotation)
const authCalls = []; // auth requests the server made

const b64url = (s) => Buffer.from(s).toString('base64url');
function accessToken(user, expiresIn = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const t = [b64url('{"alg":"HS256","typ":"JWT"}'), b64url(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + expiresIn, n: randomUUID() })), b64url('sig')].join('.');
  tokens.set(t, user);
  return t;
}
function refreshToken(user) {
  const t = randomUUID();
  refreshTokens.set(t, user);
  return t;
}
const publicUser = (u) => ({ id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
const session = (u) => ({ access_token: accessToken(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refreshToken(u), user: publicUser(u) });

// PostgREST-style filters: col=eq.x, col=is.null, col=gte.x, col=lt.x (a column may appear twice)
const SKIP = new Set(['select', 'order', 'limit', 'on_conflict', 'columns']);
function matches(row, params) {
  for (const [col, cond] of params) {
    if (SKIP.has(col)) continue;
    const [op, ...rest] = cond.split('.');
    const value = rest.join('.');
    const cell = row[col];
    if (op === 'eq' && String(cell) !== value) return false;
    if (op === 'is' && value === 'null' && cell != null) return false;
    if (op === 'gte' && !(String(cell) >= value)) return false;
    if (op === 'lt' && !(String(cell) < value)) return false;
  }
  return true;
}
function sortRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(',').map((k) => k.split('.'));
  return [...rows].sort((x, y) => {
    for (const [col, dir] of keys) {
      const c = String(x[col]).localeCompare(String(y[col]));
      if (c) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

function rest(req, res, table, params, body) {
  const accept = req.headers.accept ?? '';
  const prefer = req.headers.prefer ?? '';
  const wantsObject = accept.includes('vnd.pgrst.object');
  const reply = (status, rows) => {
    res.statusCode = status;
    if (prefer.includes('count=exact')) res.setHeader('Content-Range', `*/${rows.length}`);
    if (req.method === 'HEAD' || (req.method !== 'GET' && !prefer.includes('return=representation'))) return res.end();
    if (wantsObject) {
      if (rows.length !== 1) {
        res.statusCode = 406;
        return res.end(JSON.stringify({ code: 'PGRST116', details: `The result contains ${rows.length} rows`, message: 'JSON object requested, multiple (or no) rows returned' }));
      }
      return res.end(JSON.stringify(rows[0]));
    }
    res.end(JSON.stringify(rows));
  };
  const all = db[table];
  if (req.method === 'GET' || req.method === 'HEAD') return reply(200, sortRows(all.filter((r) => matches(r, params)), params.find(([k]) => k === 'order')?.[1]));
  if (req.method === 'POST') {
    const conflict = params.find(([k]) => k === 'on_conflict')?.[1]?.split(',');
    const saved = [body].flat().map((row) => {
      const existing = conflict && all.find((r) => conflict.every((c) => String(r[c]) === String(row[c])));
      if (existing) return Object.assign(existing, row);
      const created = { id: randomUUID(), created_at: new Date().toISOString(), done: false, ...row };
      all.push(created);
      return created;
    });
    return reply(201, saved);
  }
  if (req.method === 'PATCH') return reply(200, all.filter((r) => matches(r, params)).map((r) => Object.assign(r, body)));
  if (req.method === 'DELETE') {
    const gone = all.filter((r) => matches(r, params));
    db[table] = all.filter((r) => !gone.includes(r));
    return reply(200, gone);
  }
}

const fakeSupabase = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader('Content-Type', 'application/json');
    const fail = (status, code) => { res.statusCode = status; res.end(JSON.stringify({ code: status, error_code: code, msg: code })); };

    if (url.pathname.startsWith('/rest/v1/')) return rest(req, res, url.pathname.slice('/rest/v1/'.length), [...url.searchParams], body);
    authCalls.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), auth: req.headers.authorization ?? '' });
    if (url.pathname === '/auth/v1/user') {
      const u = tokens.get((req.headers.authorization ?? '').replace('Bearer ', ''));
      return u ? res.end(JSON.stringify(publicUser(u))) : fail(403, 'bad_jwt');
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const u = refreshTokens.get(body.refresh_token);
      if (!u) return fail(400, 'refresh_token_not_found');
      refreshTokens.delete(body.refresh_token); // used up: Supabase hands out a new one each time
      return res.end(JSON.stringify(session(u)));
    }
    if (url.pathname === '/auth/v1/logout') {
      res.statusCode = 204;
      return res.end();
    }
    fail(404, 'not_found');
  });
});

// ---------- The real app ----------

let base;
let server;
before(async () => {
  await new Promise((r) => fakeSupabase.listen(0, '127.0.0.1', r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeSupabase.address().port}`;
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  const { app } = await import('../server/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  console.error = () => {}; // the app logs expected failures; keep the test output readable
});
after(() => {
  server?.close();
  fakeSupabase.close();
});

const MONTH = '2026-10';
let ids;
beforeEach(() => {
  authCalls.length = 0;
  const task = (user, title, extra = {}) => ({ id: randomUUID(), user_id: user.id, title, due_date: '2026-10-15', kind: 'other', cost: null, done: false, created_at: new Date().toISOString(), ...extra });
  db.tasks = [task(A, 'A task'), task(B, 'B task'), task(B, 'B done task', { done: true })];
  db.expenses = [
    { id: randomUUID(), user_id: A.id, amount: 100, category: 'Food', spent_on: '2026-10-05', created_at: '1' },
    { id: randomUUID(), user_id: B.id, amount: 999, category: 'Fun', spent_on: '2026-10-06', created_at: '2' },
  ];
  db.budgets = [
    { id: randomUUID(), user_id: A.id, month: `${MONTH}-01`, amount: 1000 },
    { id: randomUUID(), user_id: B.id, month: `${MONTH}-01`, amount: 5000 },
  ];
  ids = { aTask: db.tasks[0].id, bTask: db.tasks[1].id };
});

// ---------- Helpers ----------

const signedIn = (user) => `lifeos_access=${accessToken(user)}; lifeos_refresh=${refreshToken(user)}`;
const call = (path, { method = 'GET', cookie, body } = {}) =>
  fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
function setCookies(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const i = pair.indexOf('=');
    out[pair.slice(0, i)] = { value: pair.slice(i + 1), cleared: attrs.some((a) => /^expires=thu, 01 jan 1970/i.test(a)) };
  }
  return out;
}
const titles = (rows) => rows.map((r) => r.title).sort();

const DATA_ROUTES = () => [
  ['GET', '/api/tasks'],
  ['POST', '/api/tasks', { title: 'x', due_date: '2026-10-20' }],
  ['PATCH', `/api/tasks/${ids.aTask}`, { done: true }],
  ['DELETE', `/api/tasks/${ids.aTask}`],
  ['GET', `/api/budget?month=${MONTH}`],
  ['PUT', '/api/budget', { month: MONTH, amount: 5 }],
  ['GET', `/api/expenses?month=${MONTH}`],
  ['POST', '/api/expenses', { amount: 5, category: 'Food', spent_on: '2026-10-07' }],
  ['GET', '/api/dashboard?today=2026-10-13'],
];

// ---------- Signed out ----------

test('signed out: every data route answers 401 and changes nothing', async () => {
  const before = JSON.stringify(db);
  for (const [method, path, body] of DATA_ROUTES()) {
    const res = await call(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  assert.equal(JSON.stringify(db), before);
});

test('signed out: the app page redirects to /signin; sign-in pages, scripts and health stay open', async () => {
  for (const path of ['/', '/index.html']) {
    const res = await call(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), '/signin', path);
  }
  for (const path of ['/signin', '/signup', '/styles.css', '/auth.js', '/api.js', '/api/health']) {
    assert.equal((await call(path)).status, 200, path);
  }
  assert.equal((await call('/api/auth/me')).status, 401);
});

test('signed in: the app page is served', async () => {
  const res = await call('/', { cookie: signedIn(A) });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>LifeOS<\/title>/);
});

// ---------- One user never sees or changes another user's rows ----------

test('A sees only A\'s tasks, expenses, budget and dashboard numbers', async () => {
  const cookie = signedIn(A);
  assert.deepEqual(titles(await (await call('/api/tasks', { cookie })).json()), ['A task']);
  const expenses = await (await call(`/api/expenses?month=${MONTH}`, { cookie })).json();
  assert.deepEqual(expenses.map((e) => e.amount), [100]);
  assert.deepEqual(await (await call(`/api/budget?month=${MONTH}`, { cookie })).json(), { month: MONTH, amount: 1000 });
  const dash = await (await call('/api/dashboard?today=2026-10-13', { cookie })).json();
  assert.equal(dash.taskCount, 1);
  assert.deepEqual(dash.tasksDueThisWeek.map((t) => t.title), ['A task']);
  assert.equal(dash.spentThisMonth, 100);
  assert.equal(dash.budget, 1000);
});

test('A cannot tick or delete B\'s task: 404, and B\'s row is unchanged', async () => {
  const cookie = signedIn(A);
  assert.equal((await call(`/api/tasks/${ids.bTask}`, { method: 'PATCH', cookie, body: { done: true } })).status, 404);
  assert.equal((await call(`/api/tasks/${ids.bTask}`, { method: 'DELETE', cookie })).status, 404);
  const bTask = db.tasks.find((t) => t.id === ids.bTask);
  assert.ok(bTask, 'still there');
  assert.equal(bTask.done, false, 'not ticked');
});

test('A setting a budget for the same month never touches B\'s budget', async () => {
  const res = await call('/api/budget', { method: 'PUT', cookie: signedIn(A), body: { month: MONTH, amount: 1234 } });
  assert.equal(res.status, 200);
  assert.equal(db.budgets.find((b) => b.user_id === B.id).amount, 5000);
  assert.equal(db.budgets.find((b) => b.user_id === A.id).amount, 1234);
});

test('A cannot create rows for B by sending user_id: the server always uses A', async () => {
  const cookie = signedIn(A);
  await call('/api/tasks', { method: 'POST', cookie, body: { title: 'sneaky', due_date: '2026-10-21', user_id: B.id } });
  await call('/api/expenses', { method: 'POST', cookie, body: { amount: 7, category: 'Food', spent_on: '2026-10-08', user_id: B.id } });
  assert.equal(db.tasks.find((t) => t.title === 'sneaky').user_id, A.id);
  assert.equal(db.expenses.find((e) => e.amount === 7).user_id, A.id);
});

test('every database query the data routes make is limited to the signed-in user', async () => {
  const cookie = signedIn(A);
  const seen = [];
  const original = fakeSupabase.listeners('request')[0];
  fakeSupabase.removeAllListeners('request');
  fakeSupabase.on('request', (req, res) => {
    if (req.url.startsWith('/rest/v1/')) seen.push(`${req.method} ${decodeURIComponent(req.url)}`);
    original(req, res);
  });
  try {
    for (const [method, path, body] of DATA_ROUTES()) await call(path, { method, cookie, body });
  } finally {
    fakeSupabase.removeAllListeners('request');
    fakeSupabase.on('request', original);
  }
  assert.ok(seen.length >= 9);
  for (const line of seen) {
    const isWrite = line.startsWith('POST');
    assert.ok(isWrite || line.includes(`user_id=eq.${A.id}`), `not filtered by user: ${line}`);
  }
});

// ---------- Renewing a session ----------

test('expired access cookie with a valid refresh cookie: the request works and new cookies are set', async () => {
  const oldRefresh = refreshToken(A);
  const res = await call('/api/tasks', { cookie: `lifeos_access=${accessToken(A, -60)}; lifeos_refresh=${oldRefresh}` });
  assert.equal(res.status, 200);
  assert.deepEqual(titles(await res.json()), ['A task']);
  const fresh = setCookies(res);
  assert.ok(fresh.lifeos_access?.value && !fresh.lifeos_access.cleared, 'new access cookie');
  assert.ok(fresh.lifeos_refresh?.value && fresh.lifeos_refresh.value !== oldRefresh, 'new refresh cookie');
});

test('only a refresh cookie left (access cookie deleted): still signed in', async () => {
  const res = await call('/api/dashboard?today=2026-10-13', { cookie: `lifeos_refresh=${refreshToken(A)}` });
  assert.equal(res.status, 200);
  assert.ok(setCookies(res).lifeos_access?.value);
});

test('/api/auth/me renews the same way, so /signin can send the user to Home', async () => {
  const res = await call('/api/auth/me', { cookie: `lifeos_refresh=${refreshToken(A)}` });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.email, A.email);
  assert.ok(setCookies(res).lifeos_access?.value);
});

test('a bad or used-up refresh cookie: 401 and both cookies cleared', async () => {
  for (const cookie of [`lifeos_refresh=made-up`, `lifeos_access=${accessToken(A, -60)}; lifeos_refresh=made-up`]) {
    const res = await call('/api/tasks', { cookie });
    assert.equal(res.status, 401, cookie);
    const cleared = setCookies(res);
    assert.ok(cleared.lifeos_access?.cleared && cleared.lifeos_refresh?.cleared, cookie);
  }
});

test('several requests at once with one expired session renew only once', async () => {
  const cookie = `lifeos_access=${accessToken(A, -60)}; lifeos_refresh=${refreshToken(A)}`;
  const results = await Promise.all([
    call('/api/tasks', { cookie }),
    call(`/api/budget?month=${MONTH}`, { cookie }),
    call(`/api/expenses?month=${MONTH}`, { cookie }),
    call('/api/dashboard?today=2026-10-13', { cookie }),
  ]);
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200]);
  assert.equal(authCalls.filter((c) => c.grant === 'refresh_token').length, 1);
});

// ---------- Signing out ----------

test('sign-out revokes this session at Supabase and clears both cookies', async () => {
  const access = accessToken(A);
  const res = await call('/api/auth/signout', { method: 'POST', cookie: `lifeos_access=${access}; lifeos_refresh=${refreshToken(A)}` });
  assert.equal(res.status, 204);
  const logout = authCalls.find((c) => c.path === '/auth/v1/logout');
  assert.ok(logout, 'revoked at Supabase');
  assert.equal(logout.auth, `Bearer ${access}`);
  const cleared = setCookies(res);
  assert.ok(cleared.lifeos_access.cleared && cleared.lifeos_refresh.cleared);
});

test('sign-out with an expired access cookie renews first, so it can still revoke', async () => {
  const res = await call('/api/auth/signout', { method: 'POST', cookie: `lifeos_access=${accessToken(A, -60)}; lifeos_refresh=${refreshToken(A)}` });
  assert.equal(res.status, 204);
  assert.ok(authCalls.some((c) => c.path === '/auth/v1/logout'));
  assert.ok(setCookies(res).lifeos_access.cleared);
});

test('sign-out with no session still clears the cookies', async () => {
  const res = await call('/api/auth/signout', { method: 'POST' });
  assert.equal(res.status, 204);
  assert.ok(setCookies(res).lifeos_access.cleared);
});

// ---------- user.js fails closed ----------

test('getUserId throws when no user is signed in, instead of falling back to shared rows', async () => {
  const { getUserId } = await import('../server/user.js');
  assert.throws(() => getUserId({}));
  assert.equal(getUserId({ user: { id: A.id } }), A.id);
});

test('after sign-out, the old refresh cookie no longer works, even within the renewal\'s few seconds', async () => {
  const refresh = refreshToken(A);
  const expired = `lifeos_access=${accessToken(A, -60)}; lifeos_refresh=${refresh}`;
  assert.equal((await call('/api/tasks', { cookie: expired })).status, 200, 'renewed once');
  assert.equal((await call('/api/auth/signout', { method: 'POST', cookie: expired })).status, 204);
  // A request still carrying the old cookies (for example one sent just before sign-out finished)
  const after = await call('/api/tasks', { cookie: expired });
  assert.equal(after.status, 401, 'the shared renewal was forgotten at sign-out');
});
