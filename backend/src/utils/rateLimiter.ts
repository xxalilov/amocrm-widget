const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Per-key token-bucket rate limiter. Each key (amoCRM subdomain) refills at
 * `ratePerSec` tokens/second up to `burst`. A request spends one token; when the
 * bucket is empty it waits for the next token.
 *
 * Unlike a serial chain, this ALLOWS concurrency: if the bucket has N tokens, N
 * requests proceed at once (a burst), then throughput settles at `ratePerSec`.
 * amoCRM caps each account at ~7 req/s, so we run at 6/s with a small burst.
 *
 * Callers that await each request (merges) stay sequential anyway; only callers
 * that fire requests together (paginated scans) actually use the concurrency.
 */
export class RateLimiter {
    private tokens = new Map<string, number>();
    private last = new Map<string, number>();

    constructor(private ratePerSec: number, private burst: number) {}

    // Add tokens for the time elapsed since the last refill; return current count.
    private refill(key: string): number {
        const now = Date.now();
        const last = this.last.get(key) ?? now;
        const current = this.tokens.get(key) ?? this.burst;
        const refilled = Math.min(this.burst, current + ((now - last) / 1000) * this.ratePerSec);
        this.tokens.set(key, refilled);
        this.last.set(key, now);
        return refilled;
    }

    async schedule<T>(key: string, fn: () => Promise<T>): Promise<T> {
        // Acquire one token. The refill/decrement runs synchronously (no await
        // between read and write), so concurrent callers can't double-spend.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const available = this.refill(key);
            if (available >= 1) {
                this.tokens.set(key, available - 1);
                break;
            }
            const waitMs = Math.ceil(((1 - available) / this.ratePerSec) * 1000);
            await sleep(waitMs);
        }
        return fn();
    }
}
