import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";

// Aggregates the Statistics view (#3): how many records were reviewed in the
// last scan, how many were merged, and when the last merge happened — per type.
export const getStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!.id;

        const scanStats = await models.ScanStat.findAll({ where: { account } });
        const scanByType: Record<string, any> = {};
        for (const s of scanStats) {
            const row = s.toJSON() as any;
            scanByType[row.type] = {
                scanned: row.scanned,
                groupsFound: row.groupsFound,
                scannedAt: row.scannedAt,
            };
        }

        // Merge operations recorded in history (action='merge'). recordsMerged sums
        // the duplicates folded into each surviving record.
        const merges = await models.MergeHistory.findAll({
            where: { account, action: 'merge' },
            attributes: ['type', 'duplicates', 'createdAt'],
        });

        const agg: Record<string, { operations: number; recordsMerged: number }> = {
            contact: { operations: 0, recordsMerged: 0 },
            lead: { operations: 0, recordsMerged: 0 },
        };
        let lastMergeAt: Date | null = null;
        for (const m of merges) {
            const row = m.toJSON() as any;
            const a = agg[row.type] || (agg[row.type] = { operations: 0, recordsMerged: 0 });
            a.operations += 1;
            a.recordsMerged += Array.isArray(row.duplicates) ? row.duplicates.length : 0;
            if (!lastMergeAt || new Date(row.createdAt) > lastMergeAt) lastMergeAt = new Date(row.createdAt);
        }

        const build = (type: 'contact' | 'lead') => ({
            scanned: scanByType[type]?.scanned ?? 0,
            groupsFound: scanByType[type]?.groupsFound ?? 0,
            scannedAt: scanByType[type]?.scannedAt ?? null,
            mergedOperations: agg[type].operations,
            mergedRecords: agg[type].recordsMerged,
        });

        res.json({
            success: true,
            data: {
                contact: build('contact'),
                lead: build('lead'),
                lastMergeAt,
            },
        });
    } catch (err) {
        next(err);
    }
};
