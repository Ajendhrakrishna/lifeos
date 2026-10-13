import { Router } from 'express';
import { supabase } from '../supabase.js';
import { forUser } from '../user.js';
import { dateError } from '../validate.js';
import { summarize, expenseWindow } from '../summary.js';

const router = Router();

// today comes from the browser so the week and month follow the user's time zone
router.get('/', async (req, res) => {
  const { today } = req.query;
  const problem = dateError(today, 'today');
  if (problem) return res.status(400).json({ error: problem });

  const { start, end } = expenseWindow(today);
  // Only open tasks are needed, which keeps us well under the API's 1,000-row page;
  // the count of all tasks comes separately, without loading them
  const [tasks, count, expenses, budget] = await Promise.all([
    forUser(supabase.from('tasks').select('*').eq('done', false), req),
    forUser(supabase.from('tasks').select('id', { count: 'exact', head: true }), req),
    forUser(supabase.from('expenses').select('amount, spent_on').gte('spent_on', start).lt('spent_on', end), req),
    forUser(supabase.from('budgets').select('amount').eq('month', `${today.slice(0, 7)}-01`), req).maybeSingle(),
  ]);
  for (const result of [tasks, count, expenses, budget]) if (result.error) throw result.error;

  res.json(
    summarize({ tasks: tasks.data, taskCount: count.count, expenses: expenses.data, budget: budget.data?.amount ?? null, today }),
  );
});

export default router;
