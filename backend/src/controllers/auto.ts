import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { Op } from "sequelize";
import { models } from "../utils/database";
import { loadContactSettings, loadLeadSettings, loadCompanySettings } from "../utils/settings";
import { HttpException } from "../exceptions/HttpException";

// How long a run may hold the lease without a heartbeat before another tab may
// take over. Kept SHORT so a crashed/closed tab frees the schedule quickly; an
// actively-running tab keeps it alive by calling /heartbeat every ~45s (a real
// scan+merge can take many minutes, far longer than this base TTL).
const LEASE_TTL_MS = 3 * 60_000;

type AutoType = 'contact' | 'lead' | 'company';

function isAutoType(t: any): t is AutoType {
    return t === 'contact' || t === 'lead' || t === 'company';
}

async function loadAutoSettings(accountId: string, type: AutoType) {
    const s = type === 'contact'
        ? await loadContactSettings(accountId)
        : type === 'company'
            ? await loadCompanySettings(accountId)
            : await loadLeadSettings(accountId);
    const interval = Math.max(1, Number((s as any).autoInterval) || 5);
    return { autoMerge: (s as any).autoMerge === true, interval };
}

async function getOrCreateState(accountId: string, type: AutoType) {
    const [row] = await models.AutoState.findOrCreate({
        where: { account: accountId, type },
        defaults: { account: accountId, type },
    });
    return row;
}

// A browser tab asks "is an auto run due, and may I run it?". Returns run:true
// with a lease token only when auto-merge is enabled, the schedule is due, and
// no other tab currently holds the lease. The cadence (interval) is enforced
// here, not in the browser, so many open tabs share one schedule.
export const claimAuto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type } = req.body;
        if (!isAutoType(type)) throw new HttpException(400, 'Invalid type');
        const accountId = req.account!.id;

        const { autoMerge, interval } = await loadAutoSettings(accountId, type);
        if (!autoMerge) return res.json({ run: false, enabled: false });

        await getOrCreateState(accountId, type); // ensure the row exists
        const now = new Date();
        const token = randomUUID();

        // Atomic acquire: grab the lease only if it's free (or expired) AND the
        // schedule is due. The WHERE makes this safe against two tabs claiming at
        // once — exactly one UPDATE matches, the others affect 0 rows.
        const [affected] = await models.AutoState.update(
            { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_TTL_MS) },
            {
                where: {
                    account: accountId,
                    type,
                    [Op.and]: [
                        { [Op.or]: [{ leaseExpiresAt: null }, { leaseExpiresAt: { [Op.lt]: now } }] },
                        { [Op.or]: [{ nextDueAt: null }, { nextDueAt: { [Op.lte]: now } }] },
                    ],
                },
            },
        );
        if (affected === 1) return res.json({ run: true, token, interval });
        return res.json({ run: false });
    } catch (err) {
        next(err);
    }
};

// Keep-alive: the tab that holds the lease calls this periodically while it's
// actively scanning/merging, so a long run isn't taken over mid-flight. Only the
// lease owner (matching token) can extend it.
export const heartbeatAuto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, token } = req.body;
        if (!isAutoType(type)) throw new HttpException(400, 'Invalid type');
        const accountId = req.account!.id;

        const [affected] = await models.AutoState.update(
            { leaseExpiresAt: new Date(Date.now() + LEASE_TTL_MS) },
            { where: { account: accountId, type, leaseToken: token } },
        );
        return res.json({ ok: affected === 1 });
    } catch (err) {
        next(err);
    }
};

// The tab reports a finished run. We schedule the next run (now + interval),
// record the outcome and release the lease. Ignored if the token doesn't match
// (a stale tab whose lease was already taken over).
export const completeAuto = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, token, merged, failed, error } = req.body;
        if (!isAutoType(type)) throw new HttpException(400, 'Invalid type');
        const accountId = req.account!.id;

        const state = await models.AutoState.findOne({ where: { account: accountId, type } });
        if (!state) return res.json({ ok: false });
        if (!token || state.leaseToken !== token) return res.json({ ok: false, stale: true });

        const { interval } = await loadAutoSettings(accountId, type);
        const now = Date.now();
        await state.update({
            nextDueAt: new Date(now + interval * 60_000),
            lastRunAt: new Date(now),
            lastMerged: Number(merged) || 0,
            lastFailed: Number(failed) || 0,
            lastError: typeof error === 'string' ? error.slice(0, 250) : '',
            leaseToken: null,
            leaseExpiresAt: null,
        });
        return res.json({ ok: true });
    } catch (err) {
        next(err);
    }
};

// Read-only snapshot for the settings UI: is auto on, when did it last run, what
// did it do. Returned for both entity types.
export const autoStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accountId = req.account!.id;
        const out: Record<string, unknown> = {};
        for (const type of ['contact', 'lead', 'company'] as const) {
            const { autoMerge, interval } = await loadAutoSettings(accountId, type);
            const state = await models.AutoState.findOne({ where: { account: accountId, type } });
            out[type] = {
                enabled: autoMerge,
                interval,
                lastRunAt: state?.lastRunAt ?? null,
                nextDueAt: state?.nextDueAt ?? null,
                lastMerged: state?.lastMerged ?? 0,
                lastFailed: state?.lastFailed ?? 0,
                lastError: state?.lastError ?? '',
                running: !!(state?.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() > Date.now()),
            };
        }
        res.json({ success: true, data: out });
    } catch (err) {
        next(err);
    }
};
