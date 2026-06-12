import { Request, Response, NextFunction } from 'express';

import { AccountModel } from '../models/account';

// Public-safe view of an account. Tokens and the widget key must never leave the
// server — the React client only needs id/subdomain/name.
function publicAccount(account: AccountModel) {
    return {
        id: account.id,
        name: account.name,
        subdomain: account.subdomain,
    };
}

// Returns the account the request authenticated as (derived from the widget key).
export const getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = req.account!;
        res.json({ success: true, data: publicAccount(account) });
    } catch (error) {
        next(error);
    }
}

