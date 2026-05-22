import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { HttpException } from '../exceptions/HttpException';

const contactSettingsModel = models.ContactSettings;

export const getContactSettings = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const account = req.params.id;
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

export const updateContactSettings = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const account = req.params.id;
    try {
        let contactSettings = await contactSettingsModel.findOne({
            where: { account }
        });
        if (!contactSettings) {
            contactSettings = await contactSettingsModel.create({
                account,
                status: 'active',
                ...req.body,
            });
        } else {
            await contactSettings.update(req.body);
        }
        res.json({
            success: true,
            data: contactSettings
        });
    } catch (error) {
        next(error);
    }
}