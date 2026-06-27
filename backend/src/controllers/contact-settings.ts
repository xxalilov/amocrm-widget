import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { DEFAULT_CONTACT_SETTINGS } from "../utils/settings";

const contactSettingsModel = models.ContactSettings;

// Only these fields may be set by the client; `account`/`id` are server-controlled.
const CONTACT_SETTINGS_FIELDS = ['status', 'fields', 'isFormatNumber', 'checkNumberLength', 'isTeg', 'teg', 'addMergedTag', 'mergedTag', 'autoMerge', 'autoInterval'] as const;

function pickContactSettings(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of CONTACT_SETTINGS_FIELDS) {
        if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
}

export const getContactSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!.id;
        const contactSettings = await contactSettingsModel.findOne({
            where: { account }
        });
        // No saved settings yet → return defaults (200) instead of 404, so the
        // client gets a clean response and shows defaults without a console error.
        res.json({
            success: true,
            data: contactSettings || { ...DEFAULT_CONTACT_SETTINGS, account },
        });
    } catch (error) {
        next(error);
    }
}

export const updateContactSettings = async (req: Request, res: Response, next: NextFunction) => {
    const account = req.account!.id;
    try {
        const fields = pickContactSettings(req.body);
        let contactSettings = await contactSettingsModel.findOne({
            where: { account }
        });
        if (!contactSettings) {
            contactSettings = await contactSettingsModel.create({
                account,
                status: 'active',
                ...fields,
            });
        } else {
            await contactSettings.update(fields);
        }
        res.json({
            success: true,
            data: contactSettings
        });
    } catch (error) {
        next(error);
    }
}