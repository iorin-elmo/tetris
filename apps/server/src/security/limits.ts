export class RateLimit {
  private entries = new Map<string, { tokens: number; at: number }>();
  take(key: string, rate: number, burst: number, now = Date.now()) {
    const entry = this.entries.get(key) ?? { tokens: burst, at: now };
    entry.tokens = Math.min(burst, entry.tokens + ((now - entry.at) * rate) / 1000);
    entry.at = now;
    if (entry.tokens < 1) {
      this.entries.set(key, entry);
      return false;
    }
    entry.tokens--;
    this.entries.set(key, entry);
    return true;
  }
  prune(now = Date.now()) {
    for (const [key, v] of this.entries) if (now - v.at > 300000) this.entries.delete(key);
  }
}
export class ClientError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ClientError(code, message);
}
