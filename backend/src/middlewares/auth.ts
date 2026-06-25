import { NextFunction, Request, Response } from "express";
import { models } from "../utils/database";
import { AccountModel } from "../models/account";
import { HttpException } from "../exceptions/HttpException";

// Attach the authenticated account to the request. The account is derived from
// the widget key, so handlers never trust an account identifier from the body.
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            account?: AccountModel;
        }
    }
}

function extractKey(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        return auth.slice(7).trim();
    }
    const header = req.headers['x-widget-key'];
    if (typeof header === 'string' && header.trim()) {
        return header.trim();
    }
    return null;
}

// The amoCRM subdomain the widget runs under (sent by the SPA as a header). Used
// as a zero-setup fallback when no widget key is present, so the integration
// works right after install without the user copying a key.
function extractSubdomain(req: Request): string | null {
    const header = req.headers['x-account-subdomain'];
    if (typeof header === 'string' && header.trim()) {
        return header.trim().toLowerCase();
    }
    return null;
}

// In dev (APP_ENV=dev) the API works without a key so the frontend can be opened
// directly. The account is resolved from DEV_SUBDOMAIN, or the first account.
const IS_DEV = (process.env.APP_ENV || '').toLowerCase() === 'dev';

async function resolveDevAccount() {
    if (process.env.DEV_SUBDOMAIN) {
        return models.Account.findOne({ where: { subdomain: process.env.DEV_SUBDOMAIN } });
    }
    return models.Account.findOne({ order: [['createdAt', 'ASC']] });
}

// Gate for all account-scoped API routes. In prod, rejects with 401 when the
// widget key is missing or unknown; otherwise sets req.account and continues.
export const authenticateWidget = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const key = extractKey(req);

        if (key) {
            const account = await models.Account.findOne({ where: { widget_key: key } });
            if (account) {
                req.account = account;
                return next();
            }
            if (!IS_DEV) throw new HttpException(401, 'Invalid API key');
        }

        // Zero-setup fallback: resolve the account by its amoCRM subdomain. Only an
        // installed account (with stored OAuth tokens) matches, so this works the
        // moment the widget is added — no key to copy. NOTE: the subdomain is not a
        // secret; this is a deliberate convenience trade-off, to be hardened later.
        if (!key) {
            const subdomain = extractSubdomain(req);
            if (subdomain) {
                const account = await models.Account.findOne({ where: { subdomain } });
                if (account) {
                    req.account = account;
                    return next();
                }
            }
            if (!IS_DEV) throw new HttpException(401, 'API key required');
        }

        // Dev fallback: no key (or an unknown key) — use the dev account.
        const devAccount = await resolveDevAccount();
        if (!devAccount) {
            throw new HttpException(401, 'No account available — install the integration first');
        }
        req.account = devAccount;
        next();
    } catch (err) {
        next(err);
    }
};
