// Small helpers shared by the Tasks and Money sections.

export const $ = (selector, root = document) => root.querySelector(selector);

// Today as YYYY-MM-DD in the visitor's own time zone
export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 1234.5 -> ₹1,234.50 (Indian digit grouping: ₹1,00,000.00)
export function formatMoney(value) {
  return '₹' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// '2026-10-31' -> '31 Oct' (the year is added when it is not this year)
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const options = { day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) options.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', options);
}

// Shows the one [data-state] block called `name` inside `root` (pass null to show none)
export function setState(root, name) {
  for (const el of root.querySelectorAll('[data-state]')) el.hidden = el.dataset.state !== name;
}

// Shows a message (or hides the notice when the message is empty)
export function showNotice(root, message) {
  const notice = $('.notice', root);
  $('.notice-text', notice).textContent = message;
  notice.hidden = !message;
}

// Tell the rest of the page that tasks, the budget or expenses changed (Home listens and refreshes)
export const announceChange = () => document.dispatchEvent(new Event('lifeos:change'));
