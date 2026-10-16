// Checks for data coming from the browser. Each returns an error message or null.

// Keep both lists in step with the dropdowns in public/index.html
export const KINDS = ['due', 'homework', 'project', 'chore', 'other'];
// The fixed expense categories. Picking "Other" lets the user type their own label instead.
export const CATEGORIES = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun'];

export function dateError(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${name} must be a date like 2026-10-31`;
  }
  const d = new Date(`${value}T00:00:00Z`);
  // Catches impossible dates such as 2026-02-31, year 0000 (Postgres has none),
  // and years past 9000, where adding a week could run past year 9999
  const year = Number(value.slice(0, 4));
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value || year === 0 || year > 9000) {
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

// The largest amount numeric(12,2) can hold, in paise
const MAX_PAISE = 999999999999;

// Money as a plain amount with up to 2 decimals ("120", "120.5", 120.5), or NaN.
// Paise are worked out from the digits, never from n * 100, so 1.05 stays 1.05.
// Hex, exponents, spaces, signs and a third decimal are refused rather than guessed at.
function toMoney(raw) {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string' || !/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return paise <= MAX_PAISE ? paise / 100 : NaN;
}

// Each validate function returns { value } with clean data, or { error } with a message.
export function validateTask(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    return { error: 'Please type a task (up to 200 characters)' };
  }

  const err = dateError(body.due_date, 'Due date');
  if (err) return { error: err };

  const kind = body.kind ?? 'other';
  if (!KINDS.includes(kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` };

  let cost = null;
  if (body.cost !== undefined && body.cost !== null && body.cost !== '') {
    if (kind !== 'due') return { error: 'only tasks of kind "due" can have a cost' };
    cost = toMoney(body.cost);
    if (!(cost >= 0)) return { error: 'Cost must be 0 or more, with up to 2 decimals' };
  }

  return { value: { title, due_date: body.due_date, kind, cost } };
}

export function validateBudget(body = {}) {
  const err = monthError(body.month);
  if (err) return { error: err };
  const amount = toMoney(body.amount);
  if (!(amount >= 0)) return { error: 'Budget must be 0 or more, with up to 2 decimals' };
  return { value: { month: body.month, amount } };
}

export function validateExpense(body = {}) {
  const amount = toMoney(body.amount);
  if (!(amount >= 0.01)) return { error: 'Amount must be more than 0, with up to 2 decimals' };
  // One of CATEGORIES, or the user's own label. Both are just text of 1 to 40 characters.
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (category.length < 1 || category.length > 40) {
    return { error: 'Category must be 1 to 40 characters' };
  }
  const err = dateError(body.spent_on, 'Date');
  if (err) return { error: err };
  return { value: { amount, category, spent_on: body.spent_on } };
}

// Email and password from a sign-in or sign-up form. The email is trimmed and lower-cased.
// Passwords are counted in bytes: Supabase ignores anything past 72 bytes, so longer ones are refused.
export function validateCredentials(body = {}, { newPassword = false } = {}) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address' };
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const bytes = Buffer.byteLength(password);
  if (bytes > 72) return { error: 'Password is too long (72 characters at most, fewer with accents or emoji)' };
  if (newPassword && bytes < 8) return { error: 'Password must be at least 8 characters' };
  if (bytes < 1) return { error: 'Enter your password' };
  return { value: { email, password } };
}
