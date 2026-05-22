import { Request, Response, NextFunction } from 'express';
import { models } from '../utils/database';

export const listHistory = async (
    req: Request<{ accountId: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { accountId } = req.params;
        const rows = await models.MergeHistory.findAll({
            where: { account: accountId },
            order: [['createdAt', 'DESC']],
            limit: 200,
        });
        res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
};
