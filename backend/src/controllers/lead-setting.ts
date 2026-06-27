import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { DEFAULT_LEAD_SETTINGS } from "../utils/settings";

const leadSettingsModel = models.LeadSettings;

// Only these fields may be set by the client; `account`/`id` are server-controlled.
const LEAD_SETTINGS_FIELDS = [
    'status', 'findDublicatesBy', 'checkPipelines', 'checkStatuses', 'advantage',
    'remainsStatus', 'isDifferentFunnelCheck', 'isTeg', 'teg',
    'addMergedTag', 'mergedTag', 'autoMerge', 'autoInterval',
] as const;

function pickLeadSettings(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of LEAD_SETTINGS_FIELDS) {
        if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
}

export const getLeadSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!.id;
        const leadSettings = await leadSettingsModel.findOne({
            where: { account }
        });
        // No saved settings yet → return defaults (200) instead of 404.
        res.json({
            success: true,
            data: leadSettings || { ...DEFAULT_LEAD_SETTINGS, account },
        });
    } catch (error) {
        next(error);
    }
}

export const updateLeadSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!.id;
        const fields = pickLeadSettings(req.body);
        let leadSettings = await leadSettingsModel.findOne({
            where: { account }
        });
        if (!leadSettings) {
            leadSettings = await leadSettingsModel.create({
                account,
                ...fields,
            });
        } else {
            await leadSettings.update(fields);
        }
        res.json({
            success: true,
            data: leadSettings
        });
    } catch (error) {
        next(error);
    }
}