import { models } from './database';
import { ContactSettings } from '../interfaces/contact-settings';
import { LeadSettings } from '../interfaces/lead-settings';

export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
    id: '',
    account: '',
    status: 'inactive',
    fields: 'phone',
    isFormatNumber: false,
    checkNumberLength: 0,
    isTeg: false,
    teg: '',
};

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
    id: '',
    account: '',
    status: 'inactive',
    findDublicatesBy: 'byContact',
    checkPipelines: '',
    advantage: 'newest',
    remainsStatus: '',
    isDifferentFunnelCheck: false,
    isTeg: false,
    teg: '',
};

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
