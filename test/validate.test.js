import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTask,
  validateBudget,
  validateExpense,
  monthError,
  monthBounds,
  isUuid,
  dateError,
  KINDS,
  CATEGORIES,
} from '../server/validate.js';

test('isUuid accepts real ids and rejects made-up ones', () => {
  assert.ok(isUuid('3f2b8c1e-5a4d-4e6f-9b1a-0c2d3e4f5a6b'));
  for (const bad of ['123', 'abc', '', "1'; drop table tasks;--"]) assert.ok(!isUuid(bad), bad);
});

test('accepts a good task and trims the title', () => {
  const r = validateTask({ title: '  Pay rent ', due_date: '2026-10-31', kind: 'due', cost: '12.35' });
  assert.deepEqual(r.value, { title: 'Pay rent', due_date: '2026-10-31', kind: 'due', cost: 12.35 });
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
    { title: 'a', due_date: '2026-10-31', kind: 'due', cost: -1 },
    { title: 'a', due_date: '2026-10-31', kind: 'due', cost: 'abc' },
  ];
  for (const body of bad) assert.ok(validateTask(body).error, JSON.stringify(body));
});

test('task cost rejects things that are not money', () => {
  for (const cost of [true, [], {}, '  ', Infinity]) {
    assert.ok(validateTask({ title: 'a', due_date: '2026-10-31', kind: 'due', cost }).error, String(cost));
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

test('expense: accepts a good one with up to 2 decimals', () => {
  const r = validateExpense({ amount: '99.99', category: 'Food', spent_on: '2026-10-12' });
  assert.deepEqual(r.value, { amount: 99.99, category: 'Food', spent_on: '2026-10-12' });
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
    { ...ok, category: undefined },
    { ...ok, category: '   ' },
    { ...ok, category: 'x'.repeat(41) },
    { ...ok, category: 42 },
    { ...ok, spent_on: '2026-02-31' },
    { ...ok, spent_on: undefined },
  ];
  for (const body of bad) assert.ok(validateExpense(body).error, JSON.stringify(body));
});

test('task kind defaults to other, and every kind is accepted', () => {
  assert.equal(validateTask({ title: 'a', due_date: '2026-10-31' }).value.kind, 'other');
  for (const kind of KINDS) {
    assert.equal(validateTask({ title: 'a', due_date: '2026-10-31', kind }).value.kind, kind);
  }
});

test('task kind must be one of the list', () => {
  for (const kind of ['Due', 'exam', '', 7]) {
    assert.ok(validateTask({ title: 'a', due_date: '2026-10-31', kind }).error, String(kind));
  }
});

test('only "due" tasks may have a cost; "due" without a cost is fine', () => {
  for (const kind of ['homework', 'project', 'chore', 'other', undefined]) {
    const r = validateTask({ title: 'a', due_date: '2026-10-31', kind, cost: 10 });
    assert.match(r.error ?? '', /due/, String(kind));
  }
  // An empty cost box is "no cost", so any kind may send it
  assert.equal(validateTask({ title: 'a', due_date: '2026-10-31', kind: 'homework', cost: '' }).value.cost, null);
  assert.equal(validateTask({ title: 'a', due_date: '2026-10-31', kind: 'due' }).value.cost, null);
});

test('expense: a custom category is trimmed and stored as typed, up to 40 characters', () => {
  const ok = { amount: 10, spent_on: '2026-10-12' };
  assert.equal(validateExpense({ ...ok, category: '  Gym fees ' }).value.category, 'Gym fees');
  assert.equal(validateExpense({ ...ok, category: 'Other' }).value.category, 'Other');
  assert.equal(validateExpense({ ...ok, category: 'x'.repeat(40) }).value.category.length, 40);
  assert.ok(validateExpense({ ...ok, category: ' ' + 'x'.repeat(41) }).error);
});

// Review item 3: money must look like money, and is worked out from its digits
test('money: only plain amounts with up to 2 decimals are accepted', () => {
  const ok = { category: 'Food', spent_on: '2026-10-12' };
  const amountOf = (amount) => validateExpense({ ...ok, amount }).value?.amount;
  for (const bad of ['0x10', '1e3', ' 12 ', '12.', '.5', '1,000', '12.345', 1.005, '-5', 1e21, 5e-7]) {
    assert.equal(amountOf(bad), undefined, JSON.stringify(bad));
  }
  assert.equal(amountOf('12'), 12);
  assert.equal(amountOf('1.05'), 1.05);
  assert.equal(amountOf(1.05), 1.05);
  assert.equal(amountOf('007.50'), 7.5);
});

test('money: the largest amount the database can hold is accepted, one paisa more is not', () => {
  const ok = { category: 'Food', spent_on: '2026-10-12' };
  assert.equal(validateExpense({ ...ok, amount: '9999999999.99' }).value.amount, 9999999999.99);
  for (const big of ['10000000000', '10000000000.00', '9999999999.996', 1e10]) {
    assert.ok(validateExpense({ ...ok, amount: big }).error, String(big));
  }
  assert.ok(validateBudget({ month: '2026-10', amount: '10000000000' }).error);
});

// Review item 7: Postgres has no year 0
test('dates: year 0000 is rejected, year 0001 is fine', () => {
  assert.ok(dateError('0000-01-01', 'd'));
  assert.equal(dateError('0001-01-01', 'd'), null);
  assert.ok(validateExpense({ amount: 1, category: 'Food', spent_on: '0000-06-15' }).error);
});
