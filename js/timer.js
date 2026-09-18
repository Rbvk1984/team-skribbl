// All clients compute their countdown from the same `ends_at` timestamp
// stored in the database, so nobody's timer drifts from anyone else's -
// per ARCHITECTURE.md "Timer synchronization".

export function startCountdown(endsAtIso, onTick, onDone) {
  const endsAt = new Date(endsAtIso).getTime();
  const interval = setInterval(() => {
    const remainingMs = endsAt - Date.now();
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    onTick(seconds);
    if (remainingMs <= 0) {
      clearInterval(interval);
      onDone();
    }
  }, 250);

  return () => clearInterval(interval);
}
