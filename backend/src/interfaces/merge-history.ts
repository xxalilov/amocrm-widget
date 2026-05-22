export interface MergeHistoryEntry {
    id: number;
    name: string;
}

export interface MergeHistory {
    id: string;
    account: string;
    type: string;        // 'contact' | 'lead'
    action: string;      // 'merge' | 'tag'
    mainId: number;
    mainName: string;
    duplicates: MergeHistoryEntry[];
    tag: string;
}
