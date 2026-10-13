// The dashboard numbers. A pure function: no database, no clock, no formatting.
// `today` is 'YYYY-MM-DD' from the browser, so "this week" and "this month" follow the user's time zone.
import { monthBounds } from './validate.js';

// Money is added in whole paise so 0.1 + 0.2 stays 0.30
const paise = (amount) => Math.round(Number(amount) * 100);

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// tasks: [{ due_date, kind, cost, done, ... }], expenses: [{ amount, spent_on }], budget: amount or null.
// Expenses may include days after this month (the week can run into next month); only this month counts as spent.
export function summarize({ tasks, expenses, budget, today }) {
  // ISO dates compare correctly as text: '2026-10-31' < '2026-11-01'
  const weekEnd = addDays(today, 6);
  const { start: monthStart, end: nextMonthStart } = monthBounds(today.slice(0, 7));
  const open = tasks.filter((t) => !t.done);

  const tasksDueThisWeek = open
    .filter((t) => t.due_date >= today && t.due_date <= weekEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTasks = open
    .filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((t) => ({ ...t, daysOverdue: daysBetween(t.due_date, today) }));

  // One entry per day of the week, even days with no spending
  const spendingByDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const dayPaise = expenses.filter((e) => e.spent_on === date).reduce((sum, e) => sum + paise(e.amount), 0);
    return { date, spent: dayPaise / 100 };
  });

  const upcomingPaise = open
    .filter((t) => t.kind === 'due' && t.cost !== null && t.due_date >= today && t.due_date < nextMonthStart)
    .reduce((sum, t) => sum + paise(t.cost), 0);

  const spentPaise = expenses
    .filter((e) => e.spent_on >= monthStart && e.spent_on < nextMonthStart)
    .reduce((sum, e) => sum + paise(e.amount), 0);

  const hasBudget = budget !== null && budget !== undefined;
  const remainingPaise = hasBudget ? paise(budget) - spentPaise : null;

  return {
    tasksDueThisWeek,
    spentThisMonth: spentPaise / 100,
    budget: hasBudget ? paise(budget) / 100 : null,
    budgetRemaining: hasBudget ? remainingPaise / 100 : null,
    upcomingTaskCost: upcomingPaise / 100,
    // More than what is left warns; exactly equal does not. No budget, no warning.
    overBudgetWarning: hasBudget && upcomingPaise > remainingPaise,
    taskCount: tasks.length, // done or not; 0 means the user has no tasks at all
    overdueTasks,
    overspentBy: hasBudget && remainingPaise < 0 ? -remainingPaise / 100 : 0,
    spendingByDay,
  };
}

// Which expenses summarize() needs: from the 1st of this month up to (not including) `end`,
// which is whichever comes later: next month or the day after this week.
export function expenseWindow(today) {
  const { start, end } = monthBounds(today.slice(0, 7));
  const afterWeek = addDays(today, 7);
  return { start, end: afterWeek > end ? afterWeek : end };
}
