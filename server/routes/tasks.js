import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getUserId, forUser } from '../user.js';
import { validateTask } from '../validate.js';

const router = Router();

// All tasks, soonest due first
router.get('/', async (req, res) => {
  const { data, error } = await forUser(supabase.from('tasks').select('*'), req)
    .order('due_date')
    .order('created_at');
  if (error) throw error;
  res.json(data);
});

router.post('/', async (req, res) => {
  const { value, error: problem } = validateTask(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...value, user_id: getUserId(req) })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

export default router;
