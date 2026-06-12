import axios from 'axios';
import { AccountModel } from '../models/account';
import { models } from '../utils/database';
import { HttpException } from '../exceptions/HttpException';

const accountModel = models.Account;

// Refresh window: refresh if the token expires within this many ms.
const REFRESH_SKEW_MS = 60_000;

// amoCRM rotates the refresh_token on every refresh, so two concurrent refreshes
// for the same account would invalidate each other. We de-duplicate by subdomain:
// concurrent callers share the single in-flight refresh promise.
const inFlightRefresh = new Map<string, Promise<AccountModel>>();

// Exchange the stored refresh_token for a fresh access_token.
export async function refreshAccessToken(account: AccountModel): Promise<AccountModel> {
    const existing = inFlightRefresh.get(account.subdomain);
    if (existing) return existing;

    const promise = (async () => {
        const tokenUrl = `https://${account.subdomain}.amocrm.ru/oauth2/access_token`;
        const response = await axios.post(tokenUrl, {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
            redirect_uri: process.env.REDIRECT_URI,
        });

        await account.update({
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_at: Date.now() + response.data.expires_in * 1000,
        });
        return account;
    })();

    inFlightRefresh.set(account.subdomain, promise);
    try {
        return await promise;
    } finally {
        inFlightRefresh.delete(account.subdomain);
    }
}

// Return an account with a non-expired access_token, refreshing transparently.
// Throws 401 AUTH_REQUIRED only when refresh itself fails (refresh_token dead → reinstall).
export async function getValidAccount(subdomain: string): Promise<AccountModel> {
    const account = await accountModel.findOne({ where: { subdomain } });
    if (!account) throw new HttpException(400, 'Account not found');

    const expiresAt = account.expires_at ? Number(account.expires_at) : 0;
    if (expiresAt - REFRESH_SKEW_MS > Date.now()) {
        return account;
    }

    try {
        return await refreshAccessToken(account);
    } catch (err: any) {
        console.error('Token refresh failed:', err.response?.data || err.message);
        throw new HttpException(401, 'AUTH_REQUIRED');
    }
}
