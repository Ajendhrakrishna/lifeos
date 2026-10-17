import express from 'express';
import { join } from 'node:path';
import { supabase } from './supabase.js';
import { currentUser, requireUser } from './session.js';
import tasksRouter from './routes/tasks.js';
import budgetRouter from './routes/budget.js';
import expensesRouter from './routes/expenses.js';
import dashboardRouter from './routes/dashboard.js';
import { friendlyError } from './errors.js';
import { localOnly, sameOriginWrites } from './host.js';
import authRouter from './routes/auth.js';

// The whole app, without starting it, so tests can load the real wiring
export const app = express();

const publicDir = join(import.meta.dirname, '..', 'public');

app.use(localOnly); // first, so pages and /api are both protected
app.use(sameOriginWrites);
app.use(express.json());

// The app itself needs a signed-in user. Only the access cookie travels with page requests (the
// refresh cookie is limited to /api), so after an hour /signin renews the session and comes back.
// If Supabase can't be reached, /signin is still a page that copes (raw error text is not).
app.get(['/', '/index.html'], async (req, res, next) => {
  const user = await currentUser(req).catch(() => null);
  return user ? next() : res.redirect('/signin');
});
app.use(express.static(publicDir));

// The sign-in and sign-up pages share one file; its script picks the card from the address
app.get(['/signin', '/signup'], (req, res) => res.sendFile(join(publicDir, 'auth.html')));

app.get('/api/health', async (req, res) => {
  // An empty query: it proves the database answers without reading anyone's rows
  const { error } = await supabase.from('tasks').select('id', { head: true }).limit(0);
  if (error) {
    console.error('Health check failed:', error);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ ok: false, db: false, error: message });
  }
  res.json({ ok: true, db: true });
});

app.use('/api/auth', authRouter);

// Everything below needs a signed-in user
app.use('/api', requireUser);
app.use('/api/tasks', tasksRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/dashboard', dashboardRouter);

// Unknown /api routes get JSON, not an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last stop for any error thrown in a route
app.use((err, req, res, next) => {
  console.error(err); // always the full detail, in the server's log only
  const { status, message } = friendlyError(err);
  res.status(status).json({ error: message });
});

