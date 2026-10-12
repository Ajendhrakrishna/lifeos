// The dashboard numbers. A pure function: no database, no clock, no formatting.
// `today` is 'YYYY-MM-DD' from the browser, so "this week" and "this month" follow the user's time zone.
import { monthBounds } from './validate.js';

// Money is added in whole paise so 0.1 + 0.2 stays 0.30
const paise = (amount) => Math.round(Number(amount) * 100);

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// tasks: [{ due_date, kind, cost, done, ... }], expenses: [{ amount, spent_on }], budget: amount or null
export function summarize({ tasks, expenses, budget, today }) {
  // ISO dates compare correctly as text: '2026-10-31' < '2026-11-01'
  const weekEnd = addDays(today, 6);
  const { start: monthStart, end: nextMonthStart } = monthBounds(today.slice(0, 7));
  const open = tasks.filter((t) => !t.done);

  const tasksDueThisWeek = open
    .filter((t) => t.due_date >= today && t.due_date <= weekEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

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
  };
}
