import { api } from './api.js';
import { $, todayString, formatMoney, formatDate, setState, showNotice } from './ui.js';

const root = $('#tasks');
const form = $('#task-form');
const list = $('#task-list');
let loaded = false; // false until the first successful load

// All text from the server goes in with textContent, never innerHTML.

function taskItem(task) {
  const li = $('#task-template').content.firstElementChild.cloneNode(true);
  li.dataset.id = task.id;
  const check = $('.task-check', li);
  check.checked = task.done;
  check.setAttribute('aria-label', `Done: ${task.title}`);
  $('.task-title', li).textContent = task.title;
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
  const cost = f.cost.value.trim();
  button.disabled = true;
  showNotice(root, '');
  try {
    await api('/tasks', {
      method: 'POST',
      body: { title: f.title.value, due_date: f.due_date.value, cost: cost || undefined },
    });
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
  try {
    await api(`/tasks/${check.closest('.task').dataset.id}`, { method: 'PATCH', body: { done: check.checked } });
    await load();
  } catch (err) {
    check.checked = !check.checked; // put it back, the server said no
    showNotice(root, err.message);
  }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('.task-delete');
  if (!button) return;
  showNotice(root, '');
  button.disabled = true;
  try {
    await api(`/tasks/${button.closest('.task').dataset.id}`, { method: 'DELETE' });
    await load();
  } catch (err) {
    button.disabled = false;
    showNotice(root, err.message);
  }
});

$('.retry', root).addEventListener('click', () => {
  loaded = false;
  load();
});

form.elements.due_date.value = todayString();
load();
