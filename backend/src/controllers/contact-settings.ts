import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { HttpException } from '../exceptions/HttpException';

const contactSettingsModel = models.ContactSettings;

// Only these fields may be set by the client; `account`/`id` are server-controlled.
const CONTACT_SETTINGS_FIELDS = ['status', 'fields', 'isFormatNumber', 'checkNumberLength', 'isTeg', 'teg'] as const;

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
        if (!contactSettings) {
            throw new HttpException(404, "Contact settings not found");
        }
        res.json({
            success: true,
            data: contactSettings
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