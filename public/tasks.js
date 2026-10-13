import { api } from './api.js';
import { $, todayString, formatMoney, formatDate, setState, showNotice, announceChange } from './ui.js';

const root = $('#tasks');
const form = $('#task-form');
const list = $('#task-list');
let loaded = false; // false until the first successful load
const costField = $('.field-cost', form);
// 'homework' -> 'Homework', taken from the Kind dropdown so the names live in one place
const kindNames = Object.fromEntries([...form.elements.kind.options].map((o) => [o.value, o.text]));

// All text from the server goes in with textContent, never innerHTML.

function taskItem(task) {
  const li = $('#task-template').content.firstElementChild.cloneNode(true);
  li.dataset.id = task.id;
  const check = $('.task-check', li);
  check.checked = task.done;
  check.setAttribute('aria-label', `Done: ${task.title}`);
  $('.task-title', li).textContent = task.title;
  $('.task-kind', li).textContent = kindNames[task.kind] ?? '';
  $('.task-due', li).textContent = formatDate(task.due_date);
  const hasCost = task.cost !== null;
  $('.task-cost-wrap', li).hidden = !hasCost;
  if (hasCost) $('.task-cost', li).textContent = formatMoney(task.cost);
  $('.task-delete', li).setAttribute('aria-label', `Delete task: ${task.title}`);
  return li;
}

async function load() {
  if (!loaded) setState(root, 'loading');
  try {
    const tasks = await api('/tasks');
    list.replaceChildren(...tasks.map(taskItem));
    setState(root, tasks.length ? null : 'empty');
    loaded = true;
  } catch (err) {
    if (loaded) return showNotice(root, `Couldn't refresh your tasks. ${err.message}`);
    list.replaceChildren();
    $('.state-error-text', root).textContent = `Couldn't load your tasks. ${err.message}`;
    setState(root, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', form);
  const f = form.elements;
  const kind = f.kind.value;
  const cost = kind === 'due' ? f.cost.value.trim() : '';
  button.disabled = true;
  showNotice(root, '');
  try {
    await api('/tasks', {
      method: 'POST',
      body: { title: f.title.value, due_date: f.due_date.value, kind, cost: cost || undefined },
    });
    announceChange();
    f.title.value = '';
    f.cost.value = '';
    f.title.focus();
    await load();
  } catch (err) {
    showNotice(root, err.message);
  } finally {
    button.disabled = false;
  }
});

list.addEventListener('change', async (event) => {
  const check = event.target;
  if (!check.matches('.task-check')) return;
  showNotice(root, '');
  check.disabled = true; // no second click until this save is finished
  try {
    await api(`/tasks/${check.closest('.task').dataset.id}`, { method: 'PATCH', body: { done: check.checked } });
    announceChange();
    await load();
  } catch (err) {
    check.checked = !check.checked; // put it back, the server said no
    showNotice(root, err.message);
  } finally {
    check.disabled = false;
  }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('.task-delete');
  if (!button) return;
  showNotice(root, '');
  button.disabled = true;
  try {
    await api(`/tasks/${button.closest('.task').dataset.id}`, { method: 'DELETE' });
    announceChange();
    await load();
  } catch (err) {
    button.disabled = false;
    showNotice(root, err.message);
    load(); // the task may already be gone (deleted in another tab), so re-sync the list
  }
});

$('.retry', root).addEventListener('click', () => {
  loaded = false;
  load();
});

// Only "Due" tasks (bills, fees) have a cost, so the box only shows for them
function syncCost() {
  costField.hidden = form.elements.kind.value !== 'due';
  if (costField.hidden) form.elements.cost.value = '';
}
form.elements.kind.addEventListener('change', syncCost);
syncCost(); // the browser may have restored a choice on reload

// After midnight: move the default due date on, unless the user picked one
let defaultDate = todayString();
function catchUp() {
  const today = todayString();
  if (today === defaultDate) return;
  if (form.elements.due_date.value === defaultDate) form.elements.due_date.value = today;
  defaultDate = today;
}
addEventListener('focus', catchUp);
addEventListener('hashchange', catchUp);

form.elements.due_date.value = defaultDate;
load();
