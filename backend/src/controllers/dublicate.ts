import { NextFunction, Request, Response } from "express";
import {
  searchContacts,
  searchLeadsByPhone,
  getAllContacts,
  getAllLeads,
  mergeContacts,
  mergeLeads,
  extractContactKey,
  searchLeadsByName,
} from '../services/amoApi';
import { AmoEntity } from '../types';

import { models } from "../utils/database";
import { HttpException } from '../exceptions/HttpException';
import { loadContactSettings, loadLeadSettings } from '../utils/settings';
import { getValidAccount } from '../services/auth';

async function requireAccount(subdomain: string) {
    return getValidAccount(subdomain);
}

function leadInAllowedPipeline(lead: any, checkPipelines: string): boolean {
    if (!checkPipelines) return true;
    const allowed = checkPipelines.split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length === 0) return true;
    return allowed.includes(String(lead.pipeline_id));
}

export const search = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, phone, subdomain } = req.body;
        if (!phone || !subdomain) throw new HttpException(400, 'phone and subdomain required');

        const account = await requireAccount(subdomain);
        const accessToken = account.access_token;

        let items: AmoEntity[] = [];
        if (type === 'contact') {
            const settings = await loadContactSettings(account.id);
            items = await searchContacts(subdomain, phone, accessToken, settings);
        } else if (type === 'lead') {
            items = await searchLeadsByPhone(subdomain, phone, accessToken);
        } else {
            throw new HttpException(400, 'Invalid type');
        }
        items.sort((a, b) => b.updated_at - a.updated_at);
        res.json({ duplicates: items });
    } catch (err: any) {
        console.error('Search error:', err.message);
        next(err);
    }
}

export const findAllDuplicates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, subdomain } = req.body;
        if (!subdomain) throw new HttpException(400, 'subdomain required');

        const account = await requireAccount(subdomain);
        const accessToken = account.access_token;

        let allItems: AmoEntity[] = [];
        let key: 'phone' | 'name' | 'email' = 'phone';

        if (type === 'contact') {
            const settings = await loadContactSettings(account.id);
            allItems = await getAllContacts(subdomain, accessToken);
            key = (settings.fields as any) || 'phone';

            const groupsMap = new Map<string, AmoEntity[]>();
            for (const item of allItems) {
                const k = extractContactKey(item, settings);
                if (!k) continue;
                if (!groupsMap.has(k)) groupsMap.set(k, []);
                groupsMap.get(k)!.push(item);
            }
            const resultGroups: { phone: string; items: AmoEntity[] }[] = [];
            for (const [k, items] of groupsMap.entries()) {
                if (items.length > 1) {
                    items.sort((a, b) => b.updated_at - a.updated_at);
                    resultGroups.push({ phone: k, items });
                }
            }
            return res.json({ groups: resultGroups, groupedBy: key });
        }

        if (type === 'lead') {
            const settings = await loadLeadSettings(account.id);
            allItems = await getAllLeads(subdomain, accessToken);
            const filtered = allItems.filter((l) => leadInAllowedPipeline(l, settings.checkPipelines));

            const groupsMap = new Map<string, AmoEntity[]>();
            for (const lead of filtered) {
                const groupKey = extractLeadGroupKey(lead, settings.findDublicatesBy);
                if (!groupKey) continue;
                if (!groupsMap.has(groupKey)) groupsMap.set(groupKey, []);
                groupsMap.get(groupKey)!.push(lead);
            }
            const resultGroups: { name: string; items: AmoEntity[] }[] = [];
            for (const [k, items] of groupsMap.entries()) {
                if (items.length > 1) {
                    items.sort((a, b) =>
                        settings.advantage === 'oldest' ? a.updated_at - b.updated_at : b.updated_at - a.updated_at,
                    );
                    resultGroups.push({ name: k, items });
                }
            }
            return res.json({ groups: resultGroups, groupedBy: settings.findDublicatesBy });
        }

        throw new HttpException(400, 'Invalid type');
    } catch (err: any) {
        console.error('Find all duplicates error:', err.message);
        next(err);
    }
}

function extractLeadGroupKey(lead: any, by: string): string | null {
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
        const { type, mainId, duplicateIds, subdomain, mainName, duplicates: dupSnapshot } = req.body;
        if (!type || !mainId || !duplicateIds?.length || !subdomain) {
            throw new HttpException(400, 'Missing parameters');
        }
        const account = await requireAccount(subdomain);
        const accessToken = account.access_token;

        const snapshot: { id: number; name: string }[] = Array.isArray(dupSnapshot)
            ? dupSnapshot
            : duplicateIds.map((id: number) => ({ id, name: '' }));

        if (type === 'contact') {
            const settings = await loadContactSettings(account.id);
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
            const settings = await loadLeadSettings(account.id);
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

export const searchLeadsByNames = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, subdomain } = req.body;
        if (!name || !subdomain) throw new HttpException(400, 'name and subdomain required');

        const account = await requireAccount(subdomain);
        const items = await searchLeadsByName(subdomain, name, account.access_token);
        items.sort((a, b) => b.updated_at - a.updated_at);
        res.json({ duplicates: items });
    } catch (err: any) {
        console.error('Search by name error:', err.message);
        next(err);
    }
}

export const findAllLeadDuplicatesByName = async (req: Request, res: Response, next: NextFunction) => {
  console.log('Finding all lead duplicates by name with body:', req.body);
    try {
        const { subdomain } = req.body;
        if (!subdomain) throw new HttpException(400, 'subdomain required');

        const account = await requireAccount(subdomain);
        const settings = await loadLeadSettings(account.id);
        const allLeads = await getAllLeads(subdomain, account.access_token);

        const filtered = allLeads.filter((l) => leadInAllowedPipeline(l, settings.checkPipelines));

        const groupsMap = new Map<string, AmoEntity[]>();
        for (const lead of filtered) {
            if (!lead.name) continue;
            const k = lead.name.toLowerCase();
            if (!groupsMap.has(k)) groupsMap.set(k, []);
            groupsMap.get(k)!.push(lead);
        }
        const resultGroups: { name: string; items: AmoEntity[] }[] = [];
        for (const [k, items] of groupsMap.entries()) {
            if (items.length > 1) {
                items.sort((a, b) =>
                    settings.advantage === 'oldest' ? a.updated_at - b.updated_at : b.updated_at - a.updated_at,
                );
                resultGroups.push({ name: k, items });
            }
        }
        res.json({ groups: resultGroups });
    } catch (err: any) {
        console.error('Find all lead duplicates by name error:', err.message);
        next(err);
    }
}

export const checkAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { subdomain } = req.query;
        if (!subdomain || typeof subdomain !== 'string') {
            throw new HttpException(400, 'subdomain required');
        }
        await requireAccount(subdomain);
        res.json({ authed: true });
    } catch (err) {
        next(err);
    }
}
