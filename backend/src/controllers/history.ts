import { Request, Response, NextFunction } from 'express';
import { models } from '../utils/database';

export const listHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const accountId = req.account!.id;
        const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
        const offset = (page - 1) * limit;
        const { rows, count } = await models.MergeHistory.findAndCountAll({
            where: { account: accountId },
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });
        res.json({ success: true, data: rows, total: count, page, limit });
    } catch (err) {
        next(err);
    }
};
