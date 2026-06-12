import { randomUUID } from 'crypto';

// Tracks long-running "find all duplicates" scans and "merge all" runs so the
// HTTP request can return immediately and the client can poll for progress.
//
// In-memory store: fine for a single server instance (this app runs one
// `app.listen`). If you ever scale to multiple instances behind a load balancer,
// swap this (and the scheduler/dedup below) for a shared store (Redis or a
// Postgres table) so polls reach the instance that owns the job.

export type JobStatus = 'running' | 'done' | 'error';
export type JobKind = 'scan' | 'merge';

export interface ScanGroup {
    key: string;     // stable, unique group identifier (used by the client as the row key)
    phone?: string;  // display label for contact groups (the matched value)
    name?: string;   // display label for lead groups (shared contact/company name)
    items: any[];
}

export interface Job {
    id: string;
    kind: JobKind;
    accountId: string;      // owner — only this account may read the job
    status: JobStatus;
    queued: boolean;        // true while waiting for a concurrency slot
    // scan progress
    scanned: number;        // raw records fetched from amoCRM so far
    groupsFound: number;    // duplicate groups in the final result
    groups: ScanGroup[] | null;
    groupedBy: string | null;
    // merge progress
    total: number;          // groups to merge
    processed: number;      // groups attempted (succeeded + failed)
    failed: number;         // groups that errored
    error: string | null;
    dedupKey?: string;      // collapses duplicate requests for the same account/work
    createdAt: number;
    updatedAt: number;
}

// Keep finished jobs around briefly so the client can still read the result,
// then drop them to avoid unbounded memory growth.
const TTL_MS = 30 * 60_000;
const jobs = new Map<string, Job>();

// Maps a dedup key (e.g. "scan:sub:contact") to the active job's id, so a repeat
// request returns the in-flight job instead of starting a second one.
const activeKey = new Map<string, string>();

function sweep(): void {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.updatedAt > TTL_MS) jobs.delete(id);
    }
}

export function createJob(accountId: string, kind: JobKind = 'scan', dedupKey?: string): Job {
    sweep();
    const now = Date.now();
    const job: Job = {
        id: randomUUID(),
        kind,
        accountId,
        status: 'running',
        queued: true,
        scanned: 0,
        groupsFound: 0,
        groups: null,
        groupedBy: null,
        total: 0,
        processed: 0,
        failed: 0,
        error: null,
        dedupKey,
        createdAt: now,
        updatedAt: now,
    };
    jobs.set(job.id, job);
    if (dedupKey) activeKey.set(dedupKey, job.id);
    return job;
}

export function getJob(id: string): Job | undefined {
    return jobs.get(id);
}

// The currently-running job for a dedup key, if any (stale entries self-clear).
export function activeJobFor(dedupKey: string): Job | undefined {
    const id = activeKey.get(dedupKey);
    if (!id) return undefined;
    const job = jobs.get(id);
    if (job && job.status === 'running') return job;
    activeKey.delete(dedupKey);
    return undefined;
}

export function updateJob(id: string, patch: Partial<Job>): void {
    const job = jobs.get(id);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: Date.now() });
}

// ---- Concurrency scheduler ----
// Bounds how many slot-using jobs (scans, which each hold the whole base in
// memory) run at once, to avoid OOM when many accounts scan simultaneously.
const MAX_CONCURRENT = Math.max(1, Number(process.env.JOB_CONCURRENCY) || 3);
let running = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
    if (running < MAX_CONCURRENT) {
        running++;
        return Promise.resolve();
    }
    return new Promise((resolve) => waiters.push(resolve));
}

function release(): void {
    running--;
    const next = waiters.shift();
    if (next) {
        running++;
        next();
    }
}

// Runs a job's async work. With useSlot=true the work waits for a concurrency
// slot first (use for memory-heavy scans). Failures are recorded on the job;
// the dedup key is always cleared when the work settles.
export function runJob(jobId: string, work: () => Promise<void>, opts: { useSlot?: boolean } = {}): void {
    const exec = async () => {
        try {
            updateJob(jobId, { queued: false });
            await work();
        } catch (err: any) {
            console.error('Job failed:', err.message);
            updateJob(jobId, { status: 'error', error: err.message || 'Job failed' });
        } finally {
            const job = jobs.get(jobId);
            if (job?.dedupKey && activeKey.get(job.dedupKey) === jobId) {
                activeKey.delete(job.dedupKey);
            }
            if (opts.useSlot) release();
        }
    };
    if (opts.useSlot) {
        acquire().then(exec);
    } else {
        void exec();
    }
}
