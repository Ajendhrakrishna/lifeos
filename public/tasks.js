import { api } from './api.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#task-form');
const list = $('#task-list');
const states = { loading: $('#state-loading'), empty: $('#state-empty'), error: $('#state-error') };
let loaded = false; // false until the first successful load

// All text from the server goes in with textContent, never innerHTML.

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const options = { day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) options.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', options);
}

function setState(name) {
  for (const [key, el] of Object.entries(states)) el.hidden = key !== name;
}

function showNotice(message) {
  $('#notice-text').textContent = message;
  $('#notice').hidden = !message;
}

function taskItem(task) {
  const li = $('#task-template').content.firstElementChild.cloneNode(true);
  li.dataset.id = task.id;
  const check = li.querySelector('.task-check');
  check.checked = task.done;
  check.setAttribute('aria-label', `Done: ${task.title}`);
  li.querySelector('.task-title').textContent = task.title;
  li.querySelector('.task-due').textContent = formatDate(task.due_date);
  const hasCost = task.cost !== null;
  li.querySelector('.task-cost-wrap').hidden = !hasCost;
  if (hasCost) li.querySelector('.task-cost').textContent = Number(task.cost).toFixed(2);
  li.querySelector('.task-delete').setAttribute('aria-label', `Delete task: ${task.title}`);
  return li;
}

async function load() {
  if (!loaded) setState('loading');
  try {
    const tasks = await api('/tasks');
    list.replaceChildren(...tasks.map(taskItem));
    setState(tasks.length ? null : 'empty');
    loaded = true;
  } catch (err) {
    if (loaded) return showNotice(`Couldn't refresh your tasks. ${err.message}`);
    list.replaceChildren();
    $('#state-error-text').textContent = `Couldn't load your tasks. ${err.message}`;
    setState('error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const cost = form.elements.cost.value.trim();
  button.disabled = true;
  showNotice('');
  try {
    await api('/tasks', {
      method: 'POST',
      body: { title: form.elements.title.value, due_date: form.elements.due_date.value, cost: cost || undefined },
    });
    form.elements.title.value = '';
    form.elements.cost.value = '';
    form.elements.title.focus();
    await load();
  } catch (err) {
    showNotice(err.message);
  } finally {
    button.disabled = false;
  }
});

list.addEventListener('change', async (event) => {
  const check = event.target;
  if (!check.matches('.task-check')) return;
  showNotice('');
  try {
    await api(`/tasks/${check.closest('.task').dataset.id}`, { method: 'PATCH', body: { done: check.checked } });
    await load();
  } catch (err) {
    check.checked = !check.checked; // put it back, the server said no
    showNotice(err.message);
  }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('.task-delete');
  if (!button) return;
  showNotice('');
  button.disabled = true;
  try {
    await api(`/tasks/${button.closest('.task').dataset.id}`, { method: 'DELETE' });
    await load();
  } catch (err) {
    button.disabled = false;
    showNotice(err.message);
  }
});

$('#retry').addEventListener('click', () => {
  loaded = false;
  load();
});

form.elements.due_date.value = todayString();
load();
