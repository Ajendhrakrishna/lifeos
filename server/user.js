// Who is making this request? v1 has no login, so nobody.
// In v2 this will read the logged-in user; the routes already call it.
export function getUserId(req) {
  return null;
}

// Limits a database query to the current user's rows.
export function forUser(query, req) {
  const id = getUserId(req);
  return id ? query.eq('user_id', id) : query.is('user_id', null);
}
