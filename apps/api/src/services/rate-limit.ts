export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string) {
    const time = now();
    for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);

    const current = windows.get(key);
    if (!current) {
      windows.set(key, { count: 1, resetAt: time + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return {
      allowed: current.count <= limit,
      retryAfterSeconds: Math.ceil((current.resetAt - time) / 1000),
    };
  };
}
