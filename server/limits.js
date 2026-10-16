// Counts attempts per key (an email or an IP address) over a time window.
// shortcut: counts live in this server's memory, so they reset on restart and are not shared
// between servers; the Deploy feature moves them to a shared store.
export function createLimiter({ max, windowMs }) {
  const hits = new Map(); // key -> times of recent attempts
  const recent = (key, now = Date.now()) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  return {
    blocked: (key) => recent(key).length >= max,
    add(key) {
      const now = Date.now();
      hits.set(key, [...recent(key, now), now]);
      // Forget keys with nothing recent, so memory can't grow without end
      if (hits.size > 10000) for (const k of hits.keys()) if (!recent(k, now).length) hits.delete(k);
    },
    clear: (key) => hits.delete(key),
    reset: () => hits.clear(),
  };
}
