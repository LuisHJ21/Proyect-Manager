const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60_000;

type Entry = { failures: number; blockedUntil: number };

export class LoginLimiter {
  private entries = new Map<string, Entry>();

  /** Segundos restantes de bloqueo, o 0 si se puede intentar. */
  retryAfterSeconds(key: string, now: Date): number {
    const entry = this.entries.get(key);
    if (!entry || entry.blockedUntil === 0) return 0;
    const remaining = entry.blockedUntil - now.getTime();
    if (remaining <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return Math.ceil(remaining / 1000);
  }

  recordFailure(key: string, now: Date): void {
    const entry = this.entries.get(key) ?? { failures: 0, blockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) entry.blockedUntil = now.getTime() + BLOCK_MS;
    this.entries.set(key, entry);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}
