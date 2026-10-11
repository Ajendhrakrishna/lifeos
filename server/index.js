import express from 'express';
import { supabase } from './supabase.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', async (req, res) => {
  const { error } = await supabase.from('tasks').select('id').limit(1);
  if (error) {
    console.error('Health check failed:', error.message);
    return res.status(500).json({ ok: false, db: false, error: error.message });
  }
  res.json({ ok: true, db: true });
});

// Unknown /api routes get JSON, not an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last stop for any error thrown in a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// 127.0.0.1 = only this computer can reach the app
app.listen(port, '127.0.0.1', () => {
  console.log(`LifeOS running at http://localhost:${port}`);
});
