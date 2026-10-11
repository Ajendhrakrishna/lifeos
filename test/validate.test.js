import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTask } from '../server/validate.js';

test('accepts a good task and trims the title', () => {
  const r = validateTask({ title: '  Pay rent ', due_date: '2026-10-31', cost: '12.345' });
  assert.deepEqual(r.value, { title: 'Pay rent', due_date: '2026-10-31', cost: 12.35 });
});

test('cost is optional', () => {
  for (const cost of [undefined, null, '']) {
    assert.equal(validateTask({ title: 'a', due_date: '2026-10-31', cost }).value.cost, null);
  }
});

test('rejects bad input', () => {
  const bad = [
    {},
    { title: '   ', due_date: '2026-10-31' },
    { title: 'x'.repeat(201), due_date: '2026-10-31' },
    { title: 'a' },
    { title: 'a', due_date: '2026-02-31' },
    { title: 'a', due_date: '31/10/2026' },
    { title: 'a', due_date: '2026-10-31', cost: -1 },
    { title: 'a', due_date: '2026-10-31', cost: 'abc' },
  ];
  for (const body of bad) assert.ok(validateTask(body).error, JSON.stringify(body));
});
