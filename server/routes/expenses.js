import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getUserId, forUser } from '../user.js';
import { monthError, monthBounds, validateExpense } from '../validate.js';

const router = Router();

// Expenses in one month, newest first
router.get('/', async (req, res) => {
  const problem = monthError(req.query.month);
  if (problem) return res.status(400).json({ error: problem });

  const { start, end } = monthBounds(req.query.month);
  const { data, error } = await forUser(
    supabase.from('expenses').select('*').gte('spent_on', start).lt('spent_on', end),
    req,
  )
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  res.json(data);
});

router.post('/', async (req, res) => {
  const { value, error: problem } = validateExpense(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...value, user_id: getUserId(req) })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

export default router;
