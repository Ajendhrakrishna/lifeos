import { api } from './api.js';
import { $, todayString, formatMoney, formatDate, setState, showNotice } from './ui.js';

const root = $('#money');
const list = $('#expense-list');
const month = todayString().slice(0, 7); // 'YYYY-MM': the page always shows the current month
const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
let loaded = false; // false until the first successful load
let currentBudget = null; // the budget amount, to prefill the edit dialog

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
  currentBudget = budget ? budget.amount : null;

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
// Errors appear in `noticeRoot` (the dialog for the budget form, so they are not hidden behind it).
function onSubmit(form, send, noticeRoot = root) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    showNotice(noticeRoot, '');
    try {
      await send(form.elements);
      await load();
    } catch (err) {
      showNotice(noticeRoot, err.message);
    } finally {
      button.disabled = false;
    }
  });
}

// Budget: a three-dot menu next to the figure opens a dialog with the form
const menuButton = $('#budget-menu-button');
const menu = $('#budget-menu');
const dialog = $('#budget-dialog');
const budgetForm = $('#budget-form');

function setMenu(open) {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) $('.menu-item', menu).focus();
}

menuButton.addEventListener('click', () => setMenu(menu.hidden));
menuButton.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setMenu(true);
  }
});
menu.parentElement.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    setMenu(false);
    menuButton.focus();
  }
});
// Clicking elsewhere, or tabbing out of the menu, closes it
document.addEventListener('click', (event) => {
  if (!event.target.closest('.menu-wrap')) setMenu(false);
});
menu.addEventListener('focusout', (event) => {
  if (!event.relatedTarget || !menu.parentElement.contains(event.relatedTarget)) setMenu(false);
});

$('#edit-budget').addEventListener('click', () => {
  setMenu(false);
  budgetForm.elements.amount.value = currentBudget ?? '';
  showNotice(dialog, '');
  dialog.showModal();
  budgetForm.elements.amount.select();
});
$('#budget-cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => menuButton.focus()); // Esc and Cancel both land here

onSubmit(
  budgetForm,
  async (f) => {
    await api('/budget', { method: 'PUT', body: { month, amount: f.amount.value.trim() } });
    dialog.close();
  },
  dialog,
);

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
$('#dialog-month').textContent = monthName;
$('#expense-form').elements.spent_on.value = todayString();
load();
