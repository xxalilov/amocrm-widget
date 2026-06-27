export interface LeadSettings {
    id: string;
    account: string;
    status: string;
    findDublicatesBy: string;
    checkPipelines: string;
    checkStatuses: string;   // CSV of status ids; empty = all statuses in the allowed pipelines
    advantage: string;
    remainsStatus: string;
    isDifferentFunnelCheck: boolean;
    isTeg: boolean;
    teg: string;
    addMergedTag: boolean;   // after a real merge, tag the surviving record
    mergedTag: string;       // the tag name to add (default "merged")
    autoMerge: boolean;      // periodically scan & merge in the background (browser-driven)
    autoInterval: number;    // minutes to wait after a full run before the next one
}