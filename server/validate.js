// Checks for data coming from the browser. Each returns an error message or null.

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

// Returns { value } with clean data, or { error } with a message.
export function validateTask(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    return { error: 'title is required and must be 1 to 200 characters' };
  }

  const err = dateError(body.due_date, 'due_date');
  if (err) return { error: err };

  let cost = null;
  if (body.cost !== undefined && body.cost !== null && body.cost !== '') {
    cost = Number(body.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost >= 1e10) {
      return { error: 'cost must be 0 or more' };
    }
    cost = Math.round(cost * 100) / 100;
  }

  return { value: { title, due_date: body.due_date, cost } };
}
