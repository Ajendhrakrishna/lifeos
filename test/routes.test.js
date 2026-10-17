import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

// A fake Supabase that records every request and answers like an empty database.
const requests = [];
const insertedMonths = new Set();
const fakeDb = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    requests.push({ method: req.method, url: decodeURIComponent(req.url), prefer: req.headers.prefer ?? '', body });
    res.setHeader('Content-Type', 'application/json');
    // Like the real unique (user_id, month) rule: a second plain insert for a month is refused
    if (req.method === 'POST' && req.url.startsWith('/rest/v1/budgets') && !req.url.includes('on_conflict')) {
      const { month } = JSON.parse(body);
      if (insertedMonths.has(month)) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }));
      }
      insertedMonths.add(month);
    }
    res.statusCode = req.method === 'POST' ? 201 : 200;
    res.end(req.method === 'GET' ? '[]' : '');
  });
});

const USER_ID = '11111111-2222-4333-8444-555555555555'; // the signed-in test user
let app; // our real budget route, mounted on a test server
before(async () => {
  await new Promise((resolve) => fakeDb.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeDb.address().port}`;
  process.env.SUPABASE_SECRET_KEY = 'test-key';
  const { default: budgetRouter } = await import('../server/routes/budget.js'); // after the env is set
  const server = express()
    .use(express.json())
    .use((req, res, next) => ((req.user = { id: USER_ID }), next())) // stands in for requireUser
    .use('/api/budget', budgetRouter)
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  app = { server, url: `http://127.0.0.1:${server.address().port}/api/budget` };
});
after(() => {
  app.server.close();
  fakeDb.close();
});

const putBudget = (body) =>
  fetch(app.url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Review item 4: one upsert, so two saves at the same moment can't both insert
test('setting a budget is a single upsert on (user_id, month)', async () => {
  requests.length = 0;
  const res = await putBudget({ month: '2026-10', amount: '5000' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { month: '2026-10', amount: 5000 });

  assert.equal(requests.length, 1, 'no separate look-up before writing');
  const [r] = requests;
  assert.equal(r.method, 'POST');
  assert.match(r.url, /^\/rest\/v1\/budgets\?.*on_conflict=user_id,month/);
  assert.match(r.prefer, /resolution=merge-duplicates/);
  assert.deepEqual(JSON.parse(r.body), { month: '2026-10-01', amount: 5000, user_id: USER_ID });
});

test('two budget saves at the same moment both succeed', async () => {
  const [a, b] = await Promise.all([putBudget({ month: '2026-11', amount: 100 }), putBudget({ month: '2026-11', amount: 200 })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
});

test('a bad budget never reaches the database', async () => {
  requests.length = 0;
  const res = await putBudget({ month: '2026-10', amount: '1e3' });
  assert.equal(res.status, 400);
  assert.equal(requests.length, 0);
});
