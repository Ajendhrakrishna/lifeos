// v1 only runs on this computer. Refusing any other Host stops a harmful website from
// pointing its own address at 127.0.0.1 and reading LifeOS through your browser (DNS rebinding).
// When v2 is deployed, add the real domain here.
const ALLOWED = ['localhost', '127.0.0.1'];

export function localOnly(req, res, next) {
  if (ALLOWED.includes(req.hostname)) return next();
  res.status(403).json({ error: 'Forbidden' });
}
