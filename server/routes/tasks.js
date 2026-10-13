import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getUserId, forUser } from '../user.js';
import { validateTask, isUuid } from '../validate.js';

const router = Router();

// A made-up id is "not found", not a database error
router.param('id', (req, res, next, id) => {
  if (!isUuid(id)) return res.status(404).json({ error: 'Task not found' });
  next();
});

// All tasks, soonest due first.
// shortcut: Supabase returns at most 1,000 rows per request, so a list longer than that is cut short; page through results if anyone gets near it.
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

// Mark done or not done
router.patch('/:id', async (req, res) => {
  const { done } = req.body ?? {};
  if (typeof done !== 'boolean') {
    return res.status(400).json({ error: 'done must be true or false' });
  }

  const { data, error } = await forUser(
    supabase.from('tasks').update({ done }).eq('id', req.params.id),
    req,
  )
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Task not found' });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { data, error } = await forUser(
    supabase.from('tasks').delete().eq('id', req.params.id),
    req,
  ).select('id');
  if (error) throw error;
  if (data.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

export default router;
