export interface AutoState {
    id: string;
    account: string;
    type: string;            // 'contact' | 'lead'
    nextDueAt: Date | null;  // earliest time the next auto run may start
    leaseToken: string | null;     // set while a browser tab owns the current run
    leaseExpiresAt: Date | null;   // lease auto-expires so a crashed tab can't block forever
    lastRunAt: Date | null;
    lastMerged: number;      // groups merged in the last completed run
    lastFailed: number;      // groups that failed in the last completed run
    lastError: string;       // error from the last run, if any
}
