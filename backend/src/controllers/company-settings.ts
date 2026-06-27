import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { DEFAULT_COMPANY_SETTINGS } from "../utils/settings";

const companySettingsModel = models.CompanySettings;

// Only these fields may be set by the client; `account`/`id` are server-controlled.
const COMPANY_SETTINGS_FIELDS = ['status', 'fields', 'isFormatNumber', 'checkNumberLength', 'isTeg', 'teg', 'addMergedTag', 'mergedTag', 'autoMerge', 'autoInterval'] as const;

function pickCompanySettings(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of COMPANY_SETTINGS_FIELDS) {
        if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
}

export const getCompanySettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!.id;
        const companySettings = await companySettingsModel.findOne({
            where: { account }
        });
        // No saved settings yet → return defaults (200) instead of 404.
        res.json({
            success: true,
            data: companySettings || { ...DEFAULT_COMPANY_SETTINGS, account },
        });
    } catch (error) {
        next(error);
    }
}

export const updateCompanySettings = async (req: Request, res: Response, next: NextFunction) => {
    const account = req.account!.id;
    try {
        const fields = pickCompanySettings(req.body);
        let companySettings = await companySettingsModel.findOne({
            where: { account }
        });
        if (!companySettings) {
            companySettings = await companySettingsModel.create({
                account,
                status: 'active',
                ...fields,
            });
        } else {
            await companySettings.update(fields);
        }
        res.json({
            success: true,
            data: companySettings
        });
    } catch (error) {
        next(error);
    }
}
