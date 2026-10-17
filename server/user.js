// Who is making this request? requireUser (server/session.js) sets req.user on every data route.
// Throws if it is missing, so a route that forgot requireUser fails instead of sharing rows.
export function getUserId(req) {
  const id = req.user?.id;
  if (!id) throw new Error('No signed-in user on this request');
  return id;
}

// Limits a database query to the current user's rows.
export const forUser = (query, req) => query.eq('user_id', getUserId(req));
