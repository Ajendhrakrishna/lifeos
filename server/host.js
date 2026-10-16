// v1 only runs on this computer. Refusing any other Host stops a harmful website from
// pointing its own address at 127.0.0.1 and reading LifeOS through your browser (DNS rebinding).
// When v2 is deployed, add the real domain here.
const ALLOWED = ['localhost', '127.0.0.1'];

export function localOnly(req, res, next) {
  if (ALLOWED.includes(req.hostname)) return next();
  res.status(403).json({ error: 'Forbidden' });
}

// A request that changes data must come from LifeOS's own pages. Browsers always send an Origin
// header with these requests, so another website can't submit forms or fetches using your cookies.
// Requests without an Origin don't come from a browser page, so they carry no cookies to abuse.
export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || origin === `${req.protocol}://${req.get('host')}`) return next();
  res.status(403).json({ error: 'Forbidden' });
}
