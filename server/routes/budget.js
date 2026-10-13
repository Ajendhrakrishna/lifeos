import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getUserId, forUser } from '../user.js';
import { monthError, validateBudget } from '../validate.js';

const router = Router();

// One budget per month, stored on the 1st of that month
const findBudget = (month, req) =>
  forUser(supabase.from('budgets').select('id, amount').eq('month', `${month}-01`), req).maybeSingle();

router.get('/', async (req, res) => {
  const problem = monthError(req.query.month);
  if (problem) return res.status(400).json({ error: problem });

  const { data, error } = await findBudget(req.query.month, req);
  if (error) throw error;
  res.json(data ? { month: req.query.month, amount: data.amount } : null);
});

// Set or replace the budget for a month
router.put('/', async (req, res) => {
  const { value, error: problem } = validateBudget(req.body);
  if (problem) return res.status(400).json({ error: problem });

  // One upsert, so two saves at the same moment can't both try to insert
  const { error } = await supabase
    .from('budgets')
    .upsert(
      { month: `${value.month}-01`, amount: value.amount, user_id: getUserId(req) },
      { onConflict: 'user_id,month' },
    );
  if (error) throw error;
  res.json(value);
});

export default router;
