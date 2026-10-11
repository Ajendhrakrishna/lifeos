// Who is making this request? v1 has no login, so nobody.
// In v2 this will read the logged-in user; the routes already call it.
export function getUserId(req) {
  return null;
}
