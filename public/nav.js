import { $ } from './ui.js';

// One section shows at a time; the URL hash (#tasks, #money) picks it, so a refresh stays put.
const sections = { tasks: $('#tasks'), money: $('#money') };

function show() {
  const wanted = location.hash.slice(1);
  const name = Object.hasOwn(sections, wanted) ? wanted : 'tasks'; // default and unknown hashes: Tasks
  for (const [key, section] of Object.entries(sections)) section.hidden = key !== name;
  for (const link of document.querySelectorAll('.nav-link')) {
    if (link.hash === `#${name}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

addEventListener('hashchange', show);
show();
