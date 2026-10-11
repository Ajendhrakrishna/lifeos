import { api } from './api.js';
import { $, todayString, formatMoney, formatDate, setState, showNotice } from './ui.js';

const root = $('#money');
const list = $('#expense-list');
const month = todayString().slice(0, 7); // 'YYYY-MM': the page always shows the current month
const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
let loaded = false; // false until the first successful load

// All text from the server goes in with textContent, never innerHTML.

function expenseItem(expense) {
  const li = $('#expense-template').content.firstElementChild.cloneNode(true);
  $('.expense-category', li).textContent = expense.category;
  $('.expense-amount', li).textContent = formatMoney(expense.amount);
  $('.expense-date', li).textContent = formatDate(expense.spent_on);
  return li;
}

function render(budget, expenses) {
  const budgetFigure = $('#budget-figure');
  budgetFigure.textContent = budget ? formatMoney(budget.amount) : 'No budget set';
  budgetFigure.classList.toggle('none', !budget);

  // Add up in whole paise so 0.1 + 0.2 does not become 0.30000000000000004
  const paise = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0);
  $('#spent-figure').textContent = formatMoney(paise / 100);

  list.replaceChildren(...expenses.map(expenseItem));
  setState(root, expenses.length ? null : 'empty');
}

async function load() {
  if (!loaded) setState(root, 'loading');
  try {
    const [budget, expenses] = await Promise.all([
      api(`/budget?month=${month}`),
      api(`/expenses?month=${month}`),
    ]);
    render(budget, expenses);
    loaded = true;
  } catch (err) {
    if (loaded) return showNotice(root, `Couldn't refresh your money. ${err.message}`);
    list.replaceChildren();
    $('.state-error-text', root).textContent = `Couldn't load your money. ${err.message}`;
    setState(root, 'error');
  }
}

// Runs a form submit: disables the button, shows any error, reloads on success.
function onSubmit(form, send) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    showNotice(root, '');
    try {
      await send(form.elements);
      await load();
    } catch (err) {
      showNotice(root, err.message);
    } finally {
      button.disabled = false;
    }
  });
}

onSubmit($('#budget-form'), async (f) => {
  await api('/budget', { method: 'PUT', body: { month, amount: f.amount.value.trim() } });
  f.amount.value = '';
});

onSubmit($('#expense-form'), async (f) => {
  const spentOn = f.spent_on.value;
  await api('/expenses', {
    method: 'POST',
    body: { amount: f.amount.value.trim(), category: f.category.value, spent_on: spentOn },
  });
  f.amount.value = '';
  f.amount.focus();
  // The list only shows this month, so say where an older or later expense went
  if (!spentOn.startsWith(month)) {
    showNotice(root, `Saved, but it is not in ${monthName}, so it is not listed here.`);
  }
});

$('.retry', root).addEventListener('click', () => {
  loaded = false;
  load();
});

$('#month-name').textContent = monthName;
$('#expense-form').elements.spent_on.value = todayString();
load();
