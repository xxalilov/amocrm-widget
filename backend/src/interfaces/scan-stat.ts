export interface ScanStat {
    id: string;
    account: string;
    type: string;        // 'contact' | 'lead'
    scanned: number;     // records reviewed in the last scan
    groupsFound: number; // duplicate groups found in the last scan
    scannedAt: Date;     // when that scan finished
}
