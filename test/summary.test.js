import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../server/summary.js';

// Small builders so each test only spells out what matters to it
let n = 0;
const task = (due_date, extra = {}) => ({ id: `t${++n}`, title: `Task ${n}`, due_date, kind: 'other', cost: null, done: false, ...extra });
const bill = (due_date, cost, extra = {}) => task(due_date, { kind: 'due', cost, ...extra });
const spent = (spent_on, amount) => ({ amount, category: 'Food', spent_on });
const titles = (s) => s.tasksDueThisWeek.map((t) => t.due_date);

test('nothing at all gives zeros, an empty week and no warning', () => {
  assert.deepEqual(summarize({ tasks: [], expenses: [], budget: null, today: '2026-10-13' }), {
    tasksDueThisWeek: [],
    spentThisMonth: 0,
    budget: null,
    budgetRemaining: null,
    upcomingTaskCost: 0,
    overBudgetWarning: false,
  });
});

test('the week is today plus 6 days, and it can run into next month', () => {
  const tasks = [task('2026-10-27'), task('2026-11-03'), task('2026-10-28'), task('2026-11-04'), task('2026-10-31')];
  const s = summarize({ tasks, expenses: [], budget: null, today: '2026-10-28' });
  assert.deepEqual(titles(s), ['2026-10-28', '2026-10-31', '2026-11-03']); // soonest first; 27 Oct is overdue, 4 Nov is too far
});

test('the week can run into next year', () => {
  const s = summarize({ tasks: [task('2027-01-04'), task('2027-01-05')], expenses: [], budget: null, today: '2026-12-29' });
  assert.deepEqual(titles(s), ['2027-01-04']);
});

test('done tasks are left out of the week and of the upcoming cost', () => {
  const tasks = [task('2026-10-14', { done: true }), bill('2026-10-20', 500, { done: true })];
  const s = summarize({ tasks, expenses: [], budget: 1000, today: '2026-10-13' });
  assert.deepEqual(s.tasksDueThisWeek, []);
  assert.equal(s.upcomingTaskCost, 0);
});

test('a due task with no cost is in the week but adds nothing', () => {
  const s = summarize({ tasks: [bill('2026-10-14', null)], expenses: [], budget: 100, today: '2026-10-13' });
  assert.equal(s.tasksDueThisWeek.length, 1);
  assert.equal(s.upcomingTaskCost, 0);
});

test('a Homework task is in the week but adds no cost, even if it somehow has one', () => {
  const s = summarize({ tasks: [task('2026-10-14', { kind: 'homework', cost: 999 })], expenses: [], budget: 100, today: '2026-10-13' });
  assert.equal(s.tasksDueThisWeek[0].kind, 'homework');
  assert.equal(s.upcomingTaskCost, 0);
});

test('upcoming cost counts due tasks from today to the end of this month only', () => {
  const tasks = [
    bill('2026-10-27', 1), // yesterday: overdue, not upcoming
    bill('2026-10-28', 10), // today
    bill('2026-10-31', 20), // last day of the month
    bill('2026-11-01', 400), // next month, even though it is in this week
  ];
  const s = summarize({ tasks, expenses: [], budget: 1000, today: '2026-10-28' });
  assert.equal(s.upcomingTaskCost, 30);
  assert.equal(s.tasksDueThisWeek.length, 3); // 28 Oct, 31 Oct and 1 Nov are all in the week
});

test('spent this month adds only this month, without float errors', () => {
  const expenses = [spent('2026-09-30', 999), spent('2026-10-01', 0.1), spent('2026-10-31', 0.2), spent('2026-11-01', 999)];
  const s = summarize({ tasks: [], expenses, budget: null, today: '2026-10-13' });
  assert.equal(s.spentThisMonth, 0.3);
});

test('amounts that arrive as text are still added correctly', () => {
  const s = summarize({ tasks: [bill('2026-10-20', '12.50')], expenses: [spent('2026-10-02', '7.25')], budget: '100', today: '2026-10-13' });
  assert.equal(s.spentThisMonth, 7.25);
  assert.equal(s.upcomingTaskCost, 12.5);
  assert.equal(s.budgetRemaining, 92.75);
});

test('budget remaining is budget minus spent, and can go below zero', () => {
  const s = summarize({ tasks: [], expenses: [spent('2026-10-02', 150)], budget: 100, today: '2026-10-13' });
  assert.equal(s.budget, 100);
  assert.equal(s.budgetRemaining, -50);
});

test('no budget set: remaining is null and there is never a warning', () => {
  const s = summarize({ tasks: [bill('2026-10-20', 5000)], expenses: [spent('2026-10-02', 10)], budget: null, today: '2026-10-13' });
  assert.equal(s.budgetRemaining, null);
  assert.equal(s.overBudgetWarning, false);
});

test('warning: equal to what is left is not a warning; one paisa more is', () => {
  const expenses = [spent('2026-10-02', 60)];
  const at = summarize({ tasks: [bill('2026-10-20', 40)], expenses, budget: 100, today: '2026-10-13' });
  assert.equal(at.budgetRemaining, 40);
  assert.equal(at.overBudgetWarning, false);
  const over = summarize({ tasks: [bill('2026-10-20', 40.01)], expenses, budget: 100, today: '2026-10-13' });
  assert.equal(over.overBudgetWarning, true);
});

test('a budget of 0 is a real budget: any upcoming cost warns', () => {
  assert.equal(summarize({ tasks: [], expenses: [], budget: 0, today: '2026-10-13' }).overBudgetWarning, false);
  assert.equal(summarize({ tasks: [bill('2026-10-20', 1)], expenses: [], budget: 0, today: '2026-10-13' }).overBudgetWarning, true);
});

test('already overspent with nothing upcoming still warns (0 is more than a negative remainder)', () => {
  const s = summarize({ tasks: [], expenses: [spent('2026-10-02', 150)], budget: 100, today: '2026-10-13' });
  assert.equal(s.overBudgetWarning, true);
});
