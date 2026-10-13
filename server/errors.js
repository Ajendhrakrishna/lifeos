// Turns any error thrown in a route into a status and a message for the person using the page.
// The server always logs the full error (see index.js). What the browser gets depends on NODE_ENV:
// - not "production" (your own computer): a detailed message that says what to fix
// - "production" (deployed): one general message, so internals like keys, tables and files stay private
const GENERAL = 'LifeOS is having trouble right now. Please try again in a few minutes.';

export function friendlyError(err, production = process.env.NODE_ENV === 'production') {
  // Bad JSON from the browser is the caller's mistake, not ours, and reveals nothing
  if (err?.status >= 400 && err.status < 500) return { status: err.status, message: 'Invalid request' };

  const { status, message } = detailed(err);
  return { status, message: production ? GENERAL : message };
}

function detailed(err) {
  const message = String(err?.message ?? '');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return { status: 503, message: "LifeOS can't reach its database right now. Check your internet connection, then try again." };
  }
  if (/invalid api key/i.test(message)) {
    return { status: 503, message: 'LifeOS could not sign in to its database. Check SUPABASE_SECRET_KEY in .env, then restart the server.' };
  }
  // Column or table not found: the database is older than the code
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(err?.code)) {
    return { status: 500, message: 'The database is missing an update. Run the files in db/migrations in Supabase, then try again.' };
  }
  return { status: 500, message: 'Something went wrong on the server. Please try again.' };
}
