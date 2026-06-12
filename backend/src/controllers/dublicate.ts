import { NextFunction, Request, Response } from "express";
import {
  searchContacts,
  getAllContacts,
  getAllLeads,
  mergeContacts,
  mergeLeads,
  extractContactKey,
  searchLeadsByName,
} from '../services/amoApi';
import { AmoEntity } from '../types';
import { ContactSettings } from '../interfaces/contact-settings';
import { LeadSettings } from '../interfaces/lead-settings';

import { models } from "../utils/database";
import { AccountModel } from "../models/account";
import { HttpException } from '../exceptions/HttpException';
import {
    loadContactSettings,
    loadLeadSettings,
    DEFAULT_CONTACT_SETTINGS,
    DEFAULT_LEAD_SETTINGS,
} from '../utils/settings';
import { getValidAccount } from '../services/auth';
import { createJob, getJob, updateJob, runJob, activeJobFor, ScanGroup } from '../utils/jobStore';

async function requireAccount(subdomain: string) {
    return getValidAccount(subdomain);
}

// Keeps a lead only if its pipeline is in the allow-list. Empty list = all pipelines.
function leadInAllowedPipeline(lead: any, checkPipelines: string): boolean {
    if (!checkPipelines) return true;
    const allowed = checkPipelines.split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length === 0) return true;
    return allowed.includes(String(lead.pipeline_id));
}

// Orders leads within a group so the surviving record (the "main") is first.
// `remainsStatus` decides which one REMAINS by create date (first/last created);
// update date is a stable tiebreak. (Field-value priority is a separate setting,
// `advantage`, applied at merge time — see mergeLeads.)
function leadMainComparator(settings: { remainsStatus: string }) {
    return (a: AmoEntity, b: AmoEntity) => {
        const ac = a.created_at ?? 0;
        const bc = b.created_at ?? 0;
        if (ac !== bc) {
            return settings.remainsStatus === 'last' ? bc - ac : ac - bc;
        }
        return b.updated_at - a.updated_at;
    };
}

// Group key for a lead. When isDifferentFunnelCheck is off, the pipeline is part
// of the key so only leads in the same funnel are treated as duplicates.
function leadGroupKey(lead: any, settings: { findDublicatesBy: string; isDifferentFunnelCheck: boolean }): string | null {
    const base = extractLeadGroupKey(lead, settings.findDublicatesBy);
    if (!base) return null;
    return settings.isDifferentFunnelCheck ? base : `${base}|p:${lead.pipeline_id}`;
}

// The "Enable …" master toggle (status) chooses configured behavior vs. defaults
// — it does NOT block the feature. When settings are off or missing we fall back
// to sensible defaults: contacts match by phone, leads match by name, the most
// recent record is suggested as main, and duplicates are merged (never tag-only).
function effectiveContactSettings(s: ContactSettings): ContactSettings {
    if (s.status === 'active') return s;
    return { ...DEFAULT_CONTACT_SETTINGS, account: s.account, fields: 'phone' };
}

function effectiveLeadSettings(s: LeadSettings): LeadSettings {
    if (s.status === 'active') return s;
    // byName + cross-funnel: plain name grouping across all pipelines.
    return { ...DEFAULT_LEAD_SETTINGS, account: s.account, findDublicatesBy: 'byName', isDifferentFunnelCheck: true };
}

export const search = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, phone } = req.body;
        if (!phone) throw new HttpException(400, 'phone required');

        const account = await requireAccount(req.account!.subdomain);
        const subdomain = account.subdomain;
        const accessToken = account.access_token;

        // Contact-only: amoCRM stores phone/email on contacts, not leads, so a
        // single-term lead search uses the by-name endpoint instead.
        if (type !== 'contact') {
            throw new HttpException(400, 'Invalid type');
        }
        const settings = effectiveContactSettings(await loadContactSettings(account.id));
        const items = await searchContacts(subdomain, phone, accessToken, settings);
        items.sort((a, b) => b.updated_at - a.updated_at);
        res.json({ duplicates: items });
    } catch (err: any) {
        console.error('Search error:', err.message);
        next(err);
    }
}

// ---- Scan runners (drive the background-job endpoints below) ----

type ScanResult = { groups: ScanGroup[]; groupedBy: string };

async function scanContactDuplicates(
    account: AccountModel,
    settings: ContactSettings,
    onProgress: (n: number) => void,
): Promise<ScanResult> {
    const allItems = await getAllContacts(account.subdomain, account.access_token, onProgress);
    const groupedBy = (settings.fields as string) || 'phone';

    const groupsMap = new Map<string, AmoEntity[]>();
    for (const item of allItems) {
        const k = extractContactKey(item, settings);
        if (!k) continue;
        if (!groupsMap.has(k)) groupsMap.set(k, []);
        groupsMap.get(k)!.push(item);
    }
    const groups: ScanGroup[] = [];
    for (const [k, items] of groupsMap.entries()) {
        if (items.length > 1) {
            items.sort((a, b) => b.updated_at - a.updated_at);
            groups.push({ key: k, phone: k, items });
        }
    }
    return { groups, groupedBy };
}

// Human-readable label for a lead group, based on the shared contact/company/name.
function leadGroupLabel(lead: any, by: string): string {
    if (by === 'byName') {
        return lead.name || `Lead #${lead.id}`;
    }
    if (by === 'byCompany') {
        const c = lead._embedded?.companies?.[0];
        return c?.name || (c?.id ? `Company #${c.id}` : 'Company');
    }
    const c = lead._embedded?.contacts?.[0];
    return c?.name || (c?.id ? `Contact #${c.id}` : 'Contact');
}

async function scanLeadDuplicates(
    account: AccountModel,
    settings: LeadSettings,
    onProgress: (n: number) => void,
): Promise<ScanResult> {
    const allItems = await getAllLeads(account.subdomain, account.access_token, onProgress);
    const filtered = allItems.filter((l) => leadInAllowedPipeline(l, settings.checkPipelines));

    const groupsMap = new Map<string, AmoEntity[]>();
    for (const lead of filtered) {
        const groupKey = leadGroupKey(lead, settings);
        if (!groupKey) continue;
        if (!groupsMap.has(groupKey)) groupsMap.set(groupKey, []);
        groupsMap.get(groupKey)!.push(lead);
    }
    const comparator = leadMainComparator(settings);
    const groups: ScanGroup[] = [];
    for (const [k, items] of groupsMap.entries()) {
        if (items.length > 1) {
            items.sort(comparator);
            groups.push({ key: k, name: leadGroupLabel(items[0], settings.findDublicatesBy), items });
        }
    }
    return { groups, groupedBy: settings.findDublicatesBy };
}

// Runs a scan in the background (memory-heavy → takes a concurrency slot),
// recording progress and the final result into the job store.
function runScanJob(jobId: string, scan: (onProgress: (n: number) => void) => Promise<ScanResult>): void {
    runJob(jobId, async () => {
        const onProgress = (scanned: number) => updateJob(jobId, { scanned });
        const { groups, groupedBy } = await scan(onProgress);
        updateJob(jobId, { status: 'done', groups, groupedBy, groupsFound: groups.length });
    }, { useSlot: true });
}

export const findAllDuplicates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type } = req.body;
        if (type !== 'contact' && type !== 'lead') throw new HttpException(400, 'Invalid type');

        const subdomain = req.account!.subdomain;
        const accountId = req.account!.id;

        // Collapse a repeat scan for the same account+type into the running one.
        const dedupKey = `scan:${subdomain}:${type}`;
        const existing = activeJobFor(dedupKey);
        if (existing) return res.status(202).json({ jobId: existing.id });

        // Validate account + settings up front so auth/disabled errors return
        // synchronously, then run the (potentially minutes-long) scan in the background.
        const account = await requireAccount(subdomain);

        let scan: (onProgress: (n: number) => void) => Promise<ScanResult>;
        if (type === 'contact') {
            const settings = effectiveContactSettings(await loadContactSettings(account.id));
            scan = (onProgress) => scanContactDuplicates(account, settings, onProgress);
        } else {
            const settings = effectiveLeadSettings(await loadLeadSettings(account.id));
            scan = (onProgress) => scanLeadDuplicates(account, settings, onProgress);
        }

        const job = createJob(accountId, 'scan', dedupKey);
        runScanJob(job.id, scan);
        res.status(202).json({ jobId: job.id });
    } catch (err: any) {
        console.error('Find all duplicates error:', err.message);
        next(err);
    }
}

export const getScanJob = async (req: Request<{ jobId: string }>, res: Response, next: NextFunction) => {
    try {
        const job = getJob(req.params.jobId);
        if (!job || job.accountId !== req.account!.id) throw new HttpException(404, 'Job not found or expired');
        res.json({
            kind: job.kind,
            status: job.status,
            queued: job.queued,
            // scan progress
            scanned: job.scanned,
            groupsFound: job.groupsFound,
            groups: job.kind === 'scan' && job.status === 'done' ? job.groups : undefined,
            groupedBy: job.groupedBy ?? undefined,
            // merge progress
            total: job.total,
            processed: job.processed,
            failed: job.failed,
            error: job.error ?? undefined,
        });
    } catch (err) {
        next(err);
    }
}

function extractLeadGroupKey(lead: any, by: string): string | null {
    if (by === 'byName') {
        return lead.name ? `name:${lead.name.toLowerCase().trim()}` : null;
    }
    if (by === 'byCompany') {
        const cid = lead._embedded?.companies?.[0]?.id;
        return cid ? `company:${cid}` : null;
    }
    // byContact (default)
    const cid = lead._embedded?.contacts?.[0]?.id ?? lead.main_contact_id;
    return cid ? `contact:${cid}` : null;
}

async function recordHistory(opts: {
    accountId: string;
    type: string;
    action: 'merge' | 'tag';
    mainId: number;
    mainName: string;
    duplicates: { id: number; name: string }[];
    tag: string;
}) {
    try {
        await models.MergeHistory.create({
            account: opts.accountId,
            type: opts.type,
            action: opts.action,
            mainId: opts.mainId,
            mainName: opts.mainName || '',
            duplicates: opts.duplicates || [],
            tag: opts.tag || '',
        });
    } catch (err: any) {
        console.warn('Failed to record merge history:', err.message);
    }
}

export const merge = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, mainId, duplicateIds, mainName, duplicates: dupSnapshot } = req.body;
        if (!type || !mainId || !duplicateIds?.length) {
            throw new HttpException(400, 'Missing parameters');
        }
        const account = await requireAccount(req.account!.subdomain);
        const subdomain = account.subdomain;
        const accessToken = account.access_token;

        const snapshot: { id: number; name: string }[] = Array.isArray(dupSnapshot)
            ? dupSnapshot
            : duplicateIds.map((id: number) => ({ id, name: '' }));

        if (type === 'contact') {
            const settings = effectiveContactSettings(await loadContactSettings(account.id));
            await mergeContacts(subdomain, mainId, duplicateIds, accessToken, settings);
            await recordHistory({
                accountId: account.id,
                type,
                action: settings.isTeg ? 'tag' : 'merge',
                mainId,
                mainName,
                duplicates: snapshot,
                tag: settings.isTeg ? settings.teg : '',
            });
            return res.json({ success: true, message: settings.isTeg ? 'Tag added' : 'Contacts merged' });
        }

        if (type === 'lead') {
            const settings = effectiveLeadSettings(await loadLeadSettings(account.id));
            await mergeLeads(subdomain, mainId, duplicateIds, accessToken, settings);
            await recordHistory({
                accountId: account.id,
                type,
                action: settings.isTeg ? 'tag' : 'merge',
                mainId,
                mainName,
                duplicates: snapshot,
                tag: settings.isTeg ? settings.teg : '',
            });
            return res.json({ success: true, message: settings.isTeg ? 'Tag added' : 'Leads merged' });
        }

        throw new HttpException(400, 'Invalid type');
    } catch (err: any) {
        console.error('Merge error:', err.message);
        next(err);
    }
}

interface MergeGroupInput {
    mainId: number;
    duplicateIds: number[];
    mainName?: string;
    duplicates?: { id: number; name: string }[];
}

// Merges every group in the background. Re-validates the account per group so a
// long run survives token rotation; per-group failures are counted, not fatal.
function runMergeJob(
    jobId: string,
    subdomain: string,
    accountId: string,
    type: 'contact' | 'lead',
    settings: ContactSettings | LeadSettings,
    groups: MergeGroupInput[],
): void {
    const isTeg = (settings as any).isTeg === true;
    const tag = isTeg ? (settings as any).teg || '' : '';

    // Merges are memory-light (processed group by group), so they don't take a
    // concurrency slot — but they ARE deduped per account (see mergeAll).
    runJob(jobId, async () => {
        let processed = 0;
        let failed = 0;
        for (const g of groups) {
            try {
                const mainId = Number(g.mainId);
                const duplicateIds = (g.duplicateIds || []).map(Number).filter(Boolean);
                if (mainId && duplicateIds.length) {
                    const account = await getValidAccount(subdomain); // fresh token each group
                    if (type === 'contact') {
                        await mergeContacts(subdomain, mainId, duplicateIds, account.access_token, settings as ContactSettings);
                    } else {
                        await mergeLeads(subdomain, mainId, duplicateIds, account.access_token, settings as LeadSettings);
                    }
                    await recordHistory({
                        accountId,
                        type,
                        action: isTeg ? 'tag' : 'merge',
                        mainId,
                        mainName: g.mainName || '',
                        duplicates: Array.isArray(g.duplicates) ? g.duplicates : [],
                        tag,
                    });
                }
            } catch (err: any) {
                failed++;
                console.error('Merge-all group failed:', err.message);
            }
            processed++;
            updateJob(jobId, { processed, failed });
        }
        updateJob(jobId, { status: 'done', processed, failed });
    });
}

export const mergeAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, groups } = req.body;
        if (type !== 'contact' && type !== 'lead') throw new HttpException(400, 'Invalid type');
        if (!Array.isArray(groups) || groups.length === 0) throw new HttpException(400, 'groups required');

        const subdomain = req.account!.subdomain;
        const accountId = req.account!.id;

        // Only one merge run per account at a time (avoids racing on the same
        // entities); a repeat request attaches to the running job.
        const dedupKey = `merge:${subdomain}`;
        const existing = activeJobFor(dedupKey);
        if (existing) return res.status(202).json({ jobId: existing.id });

        const account = await requireAccount(subdomain);
        const settings = type === 'contact'
            ? effectiveContactSettings(await loadContactSettings(account.id))
            : effectiveLeadSettings(await loadLeadSettings(account.id));

        const job = createJob(accountId, 'merge', dedupKey);
        updateJob(job.id, { total: groups.length });
        runMergeJob(job.id, subdomain, accountId, type, settings, groups as MergeGroupInput[]);
        res.status(202).json({ jobId: job.id });
    } catch (err: any) {
        console.error('Merge-all error:', err.message);
        next(err);
    }
}

export const searchLeadsByNames = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name } = req.body;
        if (!name) throw new HttpException(400, 'name required');

        const account = await requireAccount(req.account!.subdomain);
        const items = await searchLeadsByName(account.subdomain, name, account.access_token);
        items.sort((a, b) => b.updated_at - a.updated_at);
        res.json({ duplicates: items });
    } catch (err: any) {
        console.error('Search by name error:', err.message);
        next(err);
    }
}

// Reaching this means the widget key was valid (the auth middleware passed).
export const checkAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.json({ authed: true, subdomain: req.account!.subdomain });
    } catch (err) {
        next(err);
    }
}
