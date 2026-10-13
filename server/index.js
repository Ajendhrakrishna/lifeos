import express from 'express';
import { join } from 'node:path';
import { supabase } from './supabase.js';
import { forUser } from './user.js';
import tasksRouter from './routes/tasks.js';
import budgetRouter from './routes/budget.js';
import expensesRouter from './routes/expenses.js';
import dashboardRouter from './routes/dashboard.js';
import { friendlyError } from './errors.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(import.meta.dirname, '..', 'public')));

app.get('/api/health', async (req, res) => {
  const { error } = await forUser(supabase.from('tasks').select('id'), req).limit(1);
  if (error) {
    console.error('Health check failed:', error);
    const { status, message } = friendlyError(error);
    return res.status(status).json({ ok: false, db: false, error: message });
  }
  res.json({ ok: true, db: true });
});

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

// 127.0.0.1 = only this computer can reach the app
app.listen(port, '127.0.0.1', () => {
  console.log(`LifeOS running at http://localhost:${port}`);
});
