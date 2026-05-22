import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";

import { HttpException } from '../exceptions/HttpException';

const leadSettingsModel = models.LeadSettings;

export const getLeadSettings = async (req: Request<{id: string}>, res: Response, next: NextFunction) => {
    try {
        const account = req.params.id;
        const leadSettings = await leadSettingsModel.findOne({
            where: { account }
        });
        if (!leadSettings) {
            throw new HttpException(404, "Lead settings not found");
        }
        res.json({
            success: true,
            data: leadSettings
        });
    } catch (error) {
        next(error);
    }
}

export const updateLeadSettings = async (req: Request<{id: string}>, res: Response, next: NextFunction) => {
    try {
        const account = req.params.id;
        let leadSettings = await leadSettingsModel.findOne({
            where: { account }
        });
        if (!leadSettings) {
            leadSettings = await leadSettingsModel.create({
                account,
                ...req.body,
            });
        } else {
            await leadSettings.update(req.body);
        }
        res.json({
            success: true,
            data: leadSettings
        });
    } catch (error) {
        next(error);
    }
}