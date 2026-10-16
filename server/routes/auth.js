import { Router } from 'express';
import { authClient } from '../supabase.js';
import { validateCredentials } from '../validate.js';
import { createLimiter } from '../limits.js';
import { setSession, clearSession, currentUser, savePkce, takePkce } from '../session.js';

// Never log req.body in this file: it holds passwords.
const router = Router();

const CHECK_EMAIL = 'Check your email to confirm your account.';
const WRONG = 'Email or password is wrong.';

// Supabase sees our server's address for every user, so it can't limit per visitor; we do.
const failedSignins = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 }); // per email
const signinAttempts = createLimiter({ max: 30, windowMs: 15 * 60 * 1000 }); // per IP address
const signupAttempts = createLimiter({ max: 5, windowMs: 60 * 60 * 1000 }); // per IP address
// For tests: every test starts with fresh counts (they all come from the same address)
export const resetLimits = () => [failedSignins, signinAttempts, signupAttempts].forEach((l) => l.reset());

const tooMany = (res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

const ownAddress = (req) => `${req.protocol}://${req.get('host')}`;

router.post('/signup', async (req, res) => {
  const { value, error: problem } = validateCredentials(req.body, { newPassword: true });
  if (problem) return res.status(400).json({ error: problem });
  // Only count sign-ups that would send an email, so a few typos never lock anyone out
  if (signupAttempts.blocked(req.ip)) return tooMany(res);
  signupAttempts.add(req.ip);

  const store = new Map();
  const { error } = await authClient(store).auth.signUp({
    ...value,
    options: { emailRedirectTo: `${ownAddress(req)}/api/auth/callback?next=/` },
  });
  if (error) {
    if (error.code === 'weak_password') return res.status(400).json({ error: 'Choose a stronger password (at least 8 characters).' });
    if (error.status === 429) return tooMany(res);
    // Same answer as a new sign-up, so nobody can find out which emails have accounts
    if (error.code !== 'user_already_exists') throw error;
  }
  savePkce(res, store);
  res.json({ message: CHECK_EMAIL });
});

router.post('/signin', async (req, res) => {
  const { value, error: problem } = validateCredentials(req.body);
  if (problem) return res.status(400).json({ error: problem });
  if (signinAttempts.blocked(req.ip) || failedSignins.blocked(value.email)) return tooMany(res);
  signinAttempts.add(req.ip);

  const { data, error } = await authClient().auth.signInWithPassword(value);
  if (error) {
    if (error.code === 'invalid_credentials') {
      failedSignins.add(value.email);
      return res.status(401).json({ error: WRONG });
    }
    if (error.code === 'email_not_confirmed') {
      return res.status(403).json({ error: 'Please confirm your email first: open the link we sent you, in this browser.' });
    }
    throw error;
  }
  failedSignins.clear(value.email);
  setSession(res, data.session);
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ user });
});

router.post('/signout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

// Supabase's email link checks the address, then sends the browser here with a one-time code.
// The code only becomes a session with the verifier cookie from the browser that signed up.
router.get('/callback', async (req, res) => {
  const failed = () => res.redirect('/signin?link=signup');
  const pkce = takePkce(req, res);
  const { code } = req.query;
  if (req.query.error || typeof code !== 'string' || !code || !pkce) return failed();

  const store = new Map([[pkce.key, pkce.value]]);
  const { data, error } = await authClient(store).auth.exchangeCodeForSession(code, { flowId: pkce.flowId });
  if (error || !data?.session) {
    console.error('Email link failed:', error?.code ?? error?.message);
    return failed();
  }
  setSession(res, data.session);
  res.redirect('/'); // the only place a sign-up link goes; stop (c) adds /reset
});

export default router;
