import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../server/errors.js';

// Development (NODE_ENV is not "production"): detailed messages that say what to fix

test('bad JSON from the browser is a 400, not a server problem', () => {
  assert.deepEqual(friendlyError({ status: 400, type: 'entity.parse.failed' }, false), { status: 400, message: 'Invalid request' });
});

test('database unreachable is a 503 that says so', () => {
  for (const message of ['TypeError: fetch failed', 'getaddrinfo ENOTFOUND abc.supabase.co', 'connect ECONNREFUSED 127.0.0.1:9']) {
    const r = friendlyError({ message, code: '' }, false);
    assert.equal(r.status, 503, message);
    assert.match(r.message, /can't reach its database/);
  }
});

test('a wrong secret key points at .env', () => {
  const r = friendlyError({ message: 'Invalid API key', code: '' }, false);
  assert.equal(r.status, 503);
  assert.match(r.message, /SUPABASE_SECRET_KEY/);
});

test('a missing column or table points at the migrations', () => {
  for (const code of ['42703', '42P01', 'PGRST204', 'PGRST205']) {
    assert.match(friendlyError({ code, message: 'column tasks.kind does not exist' }, false).message, /db\/migrations/, code);
  }
});

test('anything else is a calm generic 500, with no internal details', () => {
  const r = friendlyError(new Error('secret internal detail'), false);
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.message, /secret internal detail/);
  assert.equal(friendlyError(undefined, false).status, 500);
});

// Production (NODE_ENV is "production"): one general message, no internals

const GENERAL = 'LifeOS is having trouble right now. Please try again in a few minutes.';

test('production: every server problem gets the same general message', () => {
  const problems = [
    { message: 'TypeError: fetch failed', code: '' },
    { message: 'Invalid API key', code: '' },
    { code: '42703', message: 'column tasks.kind does not exist' },
    new Error('secret internal detail'),
    undefined,
  ];
  for (const err of problems) assert.equal(friendlyError(err, true).message, GENERAL, String(err?.message));
});

test('production: no hints about .env, keys, migrations or npm', () => {
  for (const err of [{ message: 'Invalid API key' }, { code: 'PGRST204' }, { message: 'fetch failed' }]) {
    assert.doesNotMatch(friendlyError(err, true).message, /\.env|SUPABASE|migration|npm|database/i);
  }
});

test('production: status codes stay the same, and bad JSON is still a plain 400', () => {
  assert.equal(friendlyError({ message: 'fetch failed' }, true).status, 503);
  assert.equal(friendlyError(new Error('x'), true).status, 500);
  assert.deepEqual(friendlyError({ status: 400 }, true), { status: 400, message: 'Invalid request' });
});

test('the mode comes from NODE_ENV when not given', () => {
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(friendlyError({ message: 'Invalid API key' }).message, GENERAL);
    process.env.NODE_ENV = 'development';
    assert.match(friendlyError({ message: 'Invalid API key' }).message, /SUPABASE_SECRET_KEY/);
    delete process.env.NODE_ENV;
    assert.match(friendlyError({ message: 'Invalid API key' }).message, /SUPABASE_SECRET_KEY/);
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});
