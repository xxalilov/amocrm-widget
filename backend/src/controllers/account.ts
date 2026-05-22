import { Request, Response, NextFunction } from 'express';

import { models } from '../utils/database';
import { getValidAccount } from '../services/auth';

const accountModel = models.Account;

export const getAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accounts = await accountModel.findAll();
        res.json({ success: true, data: accounts });
    } catch (error) {
        next(error);
    }
}

export const getAccountBySubdomain = async (req: Request<{ subdomain: string }>, res: Response, next: NextFunction) => {
    try {
        const { subdomain } = req.params;
        const account = await getValidAccount(subdomain);
        res.json({ success: true, data: account });
    } catch (error) {
        next(error);
    }
}

