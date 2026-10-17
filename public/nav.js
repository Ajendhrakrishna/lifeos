import { api } from './api.js';
import { $ } from './ui.js';

// One section shows at a time; the URL hash (#home, #tasks, #money) picks it, so a refresh stays put.
const sections = { home: $('#home'), tasks: $('#tasks'), money: $('#money') };

function show() {
  const wanted = location.hash.slice(1);
  const name = Object.hasOwn(sections, wanted) ? wanted : 'home'; // default and unknown hashes: Home
  for (const [key, section] of Object.entries(sections)) section.hidden = key !== name;
  for (const link of document.querySelectorAll('.nav-link')) {
    if (link.hash === `#${name}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

addEventListener('hashchange', show);
show();

// Sign out, then go to the sign-in page
// If the LifeOS server can't be reached, say so: the cookies are still there, so pretending
// to have signed out would leave the user signed in when the server comes back.
const signout = $('#signout');
signout.addEventListener('click', async () => {
  signout.disabled = true;
  try {
    await api('/auth/signout', { method: 'POST' });
    location.replace('/signin');
  } catch {
    signout.textContent = "Couldn't sign out. Try again";
    signout.disabled = false;
  }
});
