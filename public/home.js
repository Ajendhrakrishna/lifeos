import { api } from './api.js';
import { $, todayString, formatMoney, formatDate, setState, showNotice } from './ui.js';

const root = $('#home');
const content = $('.home-content', root);
let loaded = false; // false until the first successful load
let shownDay = null; // the "today" the week on screen starts from

// 'homework' -> 'Homework', from the Tasks form's Kind dropdown so the names live in one place
const kindNames = Object.fromEntries([...$('#task-kind-input').options].map((o) => [o.value, o.text]));

// All text from the server goes in with textContent, never innerHTML.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clone = (id) => $(id).content.firstElementChild.cloneNode(true);
const localDate = (iso) => new Date(`${iso}T00:00:00`);
const daysFrom = (from, to) => Math.round((localDate(to) - localDate(from)) / 86400000);

// '2026-10-14' -> 'today', 'tomorrow' or 'on Thursday'
function when(iso, today) {
  const diff = daysFrom(today, iso);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `on ${localDate(iso).toLocaleDateString('en-GB', { weekday: 'long' })}`;
}

function headline(s, today) {
  const week = s.tasksDueThisWeek;
  if (!s.taskCount) return 'Nothing due this week. Add a task to begin.';
  if (!week.length) return 'Nothing due this week.';
  const next = week[0];
  return `${plural(week.length, 'task', 'tasks')} this week. Next up: ${next.title}, ${when(next.due_date, today)}.`;
}

// Overdue banners are amber and point to Tasks; money banners are terracotta and point to Money
function banner(colour, title, text) {
  const el = clone('#banner-template');
  el.classList.add(`banner-${colour}`);
  $('.banner-title', el).textContent = title;
  $('.banner-text', el).textContent = text;
  const link = $('.banner-link', el);
  const [label, href] = colour === 'amber' ? ['View tasks', '#tasks'] : ['Open money', '#money'];
  link.textContent = label;
  link.href = href;
  return el;
}

function warnings(s) {
  const list = [];
  const late = s.overdueTasks;
  if (late.length) {
    const shown = late.slice(0, 3).map((t) => `${t.title} (${plural(t.daysOverdue, 'day', 'days')})`);
    if (late.length > 3) shown.push(`and ${late.length - 3} more`);
    const lead = late.length === 1 ? '1 task is overdue' : `${late.length} tasks are overdue`;
    list.push(banner('amber', 'Overdue', `${lead}: ${shown.join(', ')}`));
  }
  if (s.overspentBy > 0) {
    list.push(banner('terracotta', 'Over budget', `You're ${formatMoney(s.overspentBy)} over budget this month`));
  } else if (s.overBudgetWarning) {
    list.push(banner('terracotta', "Dues won't fit", `Upcoming dues cost ${formatMoney(s.upcomingTaskCost)}, ${formatMoney(s.duesShortBy)} more than you have left`));
  }
  return list;
}

function dayTile(day, tasks, isToday) {
  const li = clone('#day-template');
  li.classList.toggle('today', isToday);
  $('.day-name', li).textContent = isToday
    ? 'Today'
    : localDate(day.date).toLocaleDateString('en-GB', { weekday: 'short' });
  $('.day-date', li).textContent = formatDate(day.date);
  $('.day-tasks', li).replaceChildren(
    ...tasks.map((t) => {
      const item = clone('#day-task-template');
      $('.day-task-kind', item).textContent = kindNames[t.kind] ?? '';
      $('.day-task-title', item).textContent = t.title;
      return item;
    }),
  );
  $('.day-empty', li).hidden = tasks.length > 0;
  const spent = $('.day-spent', li);
  spent.hidden = day.spent === 0;
  spent.textContent = `${formatMoney(day.spent)} spent`;
  return li;
}

function moneyLine(s) {
  const hasBudget = s.budget !== null;
  const left = $('#left-figure');
  left.textContent = hasBudget ? formatMoney(Math.max(s.budgetRemaining, 0)) : 'No budget set';
  left.classList.toggle('none', !hasBudget);
  $('#spent-of').textContent = hasBudget
    ? `${formatMoney(s.spentThisMonth)} spent of ${formatMoney(s.budget)}`
    : `${formatMoney(s.spentThisMonth)} spent this month`;
  $('.set-budget-link', root).hidden = hasBudget;

  const bar = $('.progress', root);
  bar.hidden = !hasBudget;
  if (!hasBudget) return;
  const used = s.budget > 0 ? (s.spentThisMonth / s.budget) * 100 : s.spentThisMonth > 0 ? 100 : 0;
  const pct = Math.min(100, Math.round(used));
  bar.setAttribute('aria-valuenow', String(pct));
  bar.classList.toggle('over', s.overspentBy > 0);
  $('.progress-fill', bar).style.width = `${pct}%`;
}

function render(s, today) {
  $('.banners', root).replaceChildren(...warnings(s));
  $('.headline', root).textContent = headline(s, today);
  $('.ribbon', root).replaceChildren(
    ...s.spendingByDay.map((day, i) =>
      dayTile(day, s.tasksDueThisWeek.filter((t) => t.due_date === day.date), i === 0),
    ),
  );
  moneyLine(s);
}

async function load() {
  if (!loaded) {
    setState(root, 'loading');
    content.hidden = true;
  }
  const today = todayString();
  shownDay = today;
  try {
    render(await api(`/dashboard?today=${today}`), today);
    setState(root, null);
    showNotice(root, '');
    content.hidden = false;
    loaded = true;
  } catch (err) {
    if (loaded) return showNotice(root, `Couldn't refresh your week. ${err.message}`);
    $('.state-error-text', root).textContent = `Couldn't load your week. ${err.message}`;
    setState(root, 'error');
  }
}

$('.retry', root).addEventListener('click', () => {
  loaded = false;
  load();
});
// Any task, budget or expense change elsewhere on the page
document.addEventListener('lifeos:change', load);
// The tab may stay open past midnight: when the user comes back, start the week from the new today
const catchUp = () => todayString() !== shownDay && load();
addEventListener('focus', catchUp);
addEventListener('hashchange', catchUp);
load();
