// Checks for data coming from the browser. Each returns an error message or null.

// Keep in step with the category dropdown in public/index.html
export const CATEGORIES = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Other'];

export function dateError(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${name} must be a date like 2026-10-31`;
  }
  const d = new Date(`${value}T00:00:00Z`);
  // Catches impossible dates such as 2026-02-31
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    return `${name} is not a real date`;
  }
  return null;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function monthError(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? null
    : 'month must look like 2026-10';
}

// '2026-12' -> { start: '2026-12-01', end: '2027-01-01' } (end is the first day after the month)
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start: `${month}-01`, end };
}

// Money to 2 decimals, or NaN if it is not a usable number
function toMoney(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return NaN;
  if (typeof raw === 'string' && raw.trim() === '') return NaN;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) < 1e10 ? Math.round(n * 100) / 100 : NaN;
}

// Each validate function returns { value } with clean data, or { error } with a message.
export function validateTask(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    return { error: 'title is required and must be 1 to 200 characters' };
  }

  const err = dateError(body.due_date, 'due_date');
  if (err) return { error: err };

  let cost = null;
  if (body.cost !== undefined && body.cost !== null && body.cost !== '') {
    cost = toMoney(body.cost);
    if (!(cost >= 0)) return { error: 'cost must be 0 or more' };
  }

  return { value: { title, due_date: body.due_date, cost } };
}

export function validateBudget(body = {}) {
  const err = monthError(body.month);
  if (err) return { error: err };
  const amount = toMoney(body.amount);
  if (!(amount >= 0)) return { error: 'amount must be 0 or more' };
  return { value: { month: body.month, amount } };
}

export function validateExpense(body = {}) {
  const amount = toMoney(body.amount);
  // 0.01 is the smallest we can store; 0.004 would round to 0
  if (!(amount >= 0.01)) return { error: 'amount must be more than 0' };
  if (!CATEGORIES.includes(body.category)) {
    return { error: `category must be one of: ${CATEGORIES.join(', ')}` };
  }
  const err = dateError(body.spent_on, 'spent_on');
  if (err) return { error: err };
  return { value: { amount, category: body.category, spent_on: body.spent_on } };
}
