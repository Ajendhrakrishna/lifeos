import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { localOnly } from '../server/host.js';

let server;
before(async () => {
  server = express().use(localOnly).get('/', (req, res) => res.send('ok')).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
});
after(() => server.close());

// http.get, because fetch would not let us send our own Host header. null sends no Host at all.
const statusFor = (host) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: server.address().port, path: '/', headers: host === null ? {} : { host }, setHost: host !== null }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', reject);
  });

// Review item 3: only this computer's own names are let in
test('requests for localhost or 127.0.0.1 are allowed, with or without a port', async () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000']) {
    assert.equal(await statusFor(host), 200, host);
  }
});

test('requests for any other host get 403', async () => {
  for (const host of ['evil.example', 'evil.example:3000', 'localhost.evil.example']) {
    assert.equal(await statusFor(host), 403, host);
  }
  // No Host at all: Node itself refuses it (400) before our check runs
  assert.equal(await statusFor(null), 400);
});
