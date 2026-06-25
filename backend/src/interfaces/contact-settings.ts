export interface ContactSettings {
    id: string;
    account: string;
    status: string;
    fields: string;
    isFormatNumber: boolean;
    checkNumberLength: number;
    isTeg: boolean;
    teg: string;
    addMergedTag: boolean;   // after a real merge, tag the surviving record
    mergedTag: string;       // the tag name to add (default "merged")
}