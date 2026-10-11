import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTask,
  validateBudget,
  validateExpense,
  monthError,
  monthBounds,
  isUuid,
  CATEGORIES,
} from '../server/validate.js';

test('isUuid accepts real ids and rejects made-up ones', () => {
  assert.ok(isUuid('3f2b8c1e-5a4d-4e6f-9b1a-0c2d3e4f5a6b'));
  for (const bad of ['123', 'abc', '', "1'; drop table tasks;--"]) assert.ok(!isUuid(bad), bad);
});

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

test('task cost rejects things that are not money', () => {
  for (const cost of [true, [], {}, '  ', Infinity]) {
    assert.ok(validateTask({ title: 'a', due_date: '2026-10-31', cost }).error, String(cost));
  }
});

test('monthError accepts YYYY-MM only', () => {
  assert.equal(monthError('2026-10'), null);
  for (const bad of ['2026-13', '2026-00', '2026-1', '2026-10-01', '', undefined, 202610]) {
    assert.ok(monthError(bad), String(bad));
  }
});

test('monthBounds gives the first day of the month and of the next one', () => {
  assert.deepEqual(monthBounds('2026-10'), { start: '2026-10-01', end: '2026-11-01' });
  assert.deepEqual(monthBounds('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
});

test('budget: accepts 0 and decimals, rejects bad month or amount', () => {
  assert.deepEqual(validateBudget({ month: '2026-10', amount: '5000.5' }).value, { month: '2026-10', amount: 5000.5 });
  assert.equal(validateBudget({ month: '2026-10', amount: 0 }).value.amount, 0);
  const bad = [
    {},
    { month: '2026-10' },
    { month: '2026-10', amount: -1 },
    { month: '2026-10', amount: 'abc' },
    { month: '2026-10', amount: '' },
    { month: 'Oct', amount: 100 },
  ];
  for (const body of bad) assert.ok(validateBudget(body).error, JSON.stringify(body));
});

test('expense: accepts a good one and rounds to cents', () => {
  const r = validateExpense({ amount: '99.999', category: 'Food', spent_on: '2026-10-12' });
  assert.deepEqual(r.value, { amount: 100, category: 'Food', spent_on: '2026-10-12' });
});

test('expense: every listed category is accepted', () => {
  for (const category of CATEGORIES) {
    assert.ok(validateExpense({ amount: 1, category, spent_on: '2026-10-12' }).value, category);
  }
});

test('expense: rejects zero, negative, tiny, bad category and bad date', () => {
  const ok = { amount: 10, category: 'Food', spent_on: '2026-10-12' };
  const bad = [
    {},
    { ...ok, amount: 0 },
    { ...ok, amount: -5 },
    { ...ok, amount: 0.004 },
    { ...ok, amount: 'abc' },
    { ...ok, amount: undefined },
    { ...ok, category: 'Yachts' },
    { ...ok, category: undefined },
    { ...ok, spent_on: '2026-02-31' },
    { ...ok, spent_on: undefined },
  ];
  for (const body of bad) assert.ok(validateExpense(body).error, JSON.stringify(body));
});
