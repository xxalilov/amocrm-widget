import { Request, Response, NextFunction } from 'express';
import { getPipelines } from '../services/amoApi';
import { getValidAccount } from '../services/auth';

export const listPipelines = async (
    req: Request<{ subdomain: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { subdomain } = req.params;
        const account = await getValidAccount(subdomain);

        const raw = await getPipelines(subdomain, account.access_token);

        const pipelines = raw.map((p: any) => ({
            id: p.id,
            name: p.name,
            is_main: p.is_main,
            statuses: (p._embedded?.statuses || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                color: s.color,
            })),
        }));
        res.json({ success: true, data: pipelines });
    } catch (err) {
        next(err);
    }
};
