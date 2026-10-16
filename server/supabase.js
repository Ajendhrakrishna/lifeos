import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Fill them in your .env file (see .env.example).');
  process.exit(1);
}

// Secret key: backend only. Never send it to the browser.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// A fresh client for one sign-in, sign-up or email-link exchange. Sign-in makes a client
// remember that user, so these calls must never use the shared client above, or its next
// database query could run as that user. PKCE mode: Supabase's email link only becomes a
// session together with a secret verifier, which this client keeps in `store`; session.js
// saves it in an httpOnly cookie in the browser that asked for the email.
export function authClient(store = new Map()) {
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: true, // needed for the client to use our store at all
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'lifeos',
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
}
