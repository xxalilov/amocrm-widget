export interface LeadSettings {
    id: string;
    account: string;
    status: string;
    findDublicatesBy: string;
    checkPipelines: string;
    advantage: string;
    remainsStatus: string;
    isDifferentFunnelCheck: boolean;
    isTeg: boolean;
    teg: string;
    addMergedTag: boolean;   // after a real merge, tag the surviving record
    mergedTag: string;       // the tag name to add (default "merged")
}