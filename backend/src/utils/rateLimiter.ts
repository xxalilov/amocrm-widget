const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Per-key rate limiter. Requests sharing a key run one-at-a-time, spaced by
 * at least `minIntervalMs`. amoCRM limits each account to ~7 req/s, so we key
 * by subdomain and space requests ~160ms apart (~6.2 req/s, safely under cap).
 * Different keys (accounts) run fully in parallel.
 */
export class RateLimiter {
    private tail = new Map<string, Promise<unknown>>();
    private last = new Map<string, number>();

    constructor(private minIntervalMs: number) {}

    schedule<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.tail.get(key) ?? Promise.resolve();
        const run = prev.then(async () => {
            const wait = this.minIntervalMs - (Date.now() - (this.last.get(key) ?? 0));
            if (wait > 0) await sleep(wait);
            try {
                return await fn();
            } finally {
                this.last.set(key, Date.now());
            }
        });
        // Keep a non-rejecting tail so one failed request doesn't break the chain.
        this.tail.set(key, run.then(() => undefined, () => undefined));
        return run;
    }
}
