import { models } from './database';
import { ContactSettings } from '../interfaces/contact-settings';
import { LeadSettings } from '../interfaces/lead-settings';
import { CompanySettings } from '../interfaces/company-settings';

export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
    id: '',
    account: '',
    status: 'active',
    fields: 'phone',
    isFormatNumber: false,
    checkNumberLength: 9,
    isTeg: false,
    teg: '',
    addMergedTag: false,
    mergedTag: 'merged',
    autoMerge: false,
    autoInterval: 5,
    preventDuplicates: false,   // contact prevention
};

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
    id: '',
    account: '',
    status: 'active',
    findDublicatesBy: 'byContact',
    checkPipelines: '',
    checkStatuses: '',
    advantage: 'newest',
    remainsStatus: '',
    isDifferentFunnelCheck: false,
    isTeg: false,
    teg: '',
    addMergedTag: false,
    mergedTag: 'merged',
    autoMerge: false,
    autoInterval: 5,
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    id: '',
    account: '',
    status: 'active',
    fields: 'name',
    isFormatNumber: false,
    checkNumberLength: 9,
    isTeg: false,
    teg: '',
    addMergedTag: false,
    mergedTag: 'merged',
    autoMerge: false,
    autoInterval: 5,
    preventDuplicates: false,
};

export async function loadCompanySettings(accountId: string): Promise<CompanySettings> {
    const row = await models.CompanySettings.findOne({ where: { account: accountId } });
    if (!row) return { ...DEFAULT_COMPANY_SETTINGS, account: accountId };
    return row.toJSON() as CompanySettings;
}

export async function loadContactSettings(accountId: string): Promise<ContactSettings> {
    const row = await models.ContactSettings.findOne({ where: { account: accountId } });
    if (!row) return { ...DEFAULT_CONTACT_SETTINGS, account: accountId };
    return row.toJSON() as ContactSettings;
}

export async function loadLeadSettings(accountId: string): Promise<LeadSettings> {
    const row = await models.LeadSettings.findOne({ where: { account: accountId } });
    if (!row) return { ...DEFAULT_LEAD_SETTINGS, account: accountId };
    return row.toJSON() as LeadSettings;
}
