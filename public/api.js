// The only way the browser talks to the server: our own /api routes.
// Returns the JSON answer (or null for "no content"), or throws an Error with a readable message.
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // The server is down, so it can't tell us NODE_ENV. Only someone running LifeOS on
    // their own computer can start it, so only they get the npm hint.
    throw new Error(
      local
        ? "Can't reach the LifeOS server. Make sure it is running (npm run dev), then try again."
        : "Can't reach the LifeOS server. Please try again in a few minutes.",
    );
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
