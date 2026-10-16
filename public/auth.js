import { api } from './api.js';
import { $, setState, showNotice } from './ui.js';

// One page for /signin and /signup; the address picks the card.
const card = $('#auth-card');
const mode = location.pathname === '/signup' ? 'signup' : 'signin';
const panel = (name) => $(`[data-state="${name}"]`, card);

// Messages the email-link callback can send us to, chosen by key (never text from the address)
const LINK_MESSAGES = {
  signup: 'If you just confirmed your email, sign in below.',
};

// Show or hide a password, and say which the button will do next
for (const button of card.querySelectorAll('.password-toggle')) {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!showing));
    button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
}

// Disables the button while sending, shows any error inside the card
function onSubmit(form, send) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    const root = form.closest('[data-state]');
    button.disabled = true;
    showNotice(root, '');
    try {
      await send({ email: form.elements.email.value, password: form.elements.password.value });
    } catch (err) {
      showNotice(root, err.message);
    } finally {
      button.disabled = false;
    }
  });
}

onSubmit($('#signin-form'), async (body) => {
  await api('/auth/signin', { method: 'POST', body });
  location.replace('/');
});

onSubmit($('#signup-form'), async (body) => {
  await api('/auth/signup', { method: 'POST', body });
  setState(card, 'sent');
});

async function start() {
  // Already signed in? Go straight to Home. This request carries the session cookies.
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) return location.replace('/');
  } catch {
    // Server unreachable: show the form anyway; submitting will say what's wrong
  }
  document.title = mode === 'signup' ? 'Create your account · LifeOS' : 'Sign in · LifeOS';
  setState(card, mode);
  const message = LINK_MESSAGES[new URLSearchParams(location.search).get('link')];
  if (message) showNotice(panel(mode), message);
  $('input[name="email"]', panel(mode)).focus();
}

start();
