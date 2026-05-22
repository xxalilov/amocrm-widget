import axios from 'axios';
import http from 'http';
import https from 'https';
import { AmoEntity, SearchResult } from '../types';
import { ContactSettings } from '../interfaces/contact-settings';
import { LeadSettings } from '../interfaces/lead-settings';
import { RateLimiter } from '../utils/rateLimiter';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Shared client with keep-alive connection pooling (reused across all requests).
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const client = axios.create({ httpAgent, httpsAgent, timeout: 30_000 });

// ~6.2 req/s per account, safely under amoCRM's ~7 req/s cap.
const limiter = new RateLimiter(160);
const MAX_RETRIES = 4;

export async function amoRequest<T>(
  subdomain: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  accessToken: string,
  data?: any
): Promise<T> {
  return limiter.schedule(subdomain, async () => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const response = await client.request<T>({
          method,
          url: `https://${subdomain}.amocrm.ru${url}`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data,
        });
        return response.data;
      } catch (err: any) {
        const status = err.response?.status;
        const retriable = status === 429 || (status >= 500 && status < 600);
        if (!retriable || attempt >= MAX_RETRIES) throw err;

        const retryAfter = Number(err.response?.headers?.['retry-after']);
        const backoff = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 500, 8000);
        console.warn(`amoCRM ${status} on ${url} — retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms`);
        await sleep(backoff);
        attempt++;
      }
    }
  });
}


export async function getPipelines(subdomain: string, accessToken: string): Promise<any[]> {
  const result = await amoRequest<any>(subdomain, 'get', '/api/v4/leads/pipelines', accessToken);
  return result._embedded?.pipelines || [];
}

export function extractPhone(entity: AmoEntity): string | null {
  const phones = entity.custom_fields_values?.filter(
    f => f.field_code === 'PHONE' || f.field_name === 'Телефон'
  ) || [];
  if (phones.length === 0) return null;
  const rawPhone = phones[0].values[0]?.value;
  if (!rawPhone) return null;

  return rawPhone.replace(/\D/g, '');
}

export function extractEmail(entity: AmoEntity): string | null {
  const emails = entity.custom_fields_values?.filter(
    f => f.field_code === 'EMAIL' || f.field_name === 'Email'
  ) || [];
  if (emails.length === 0) return null;
  const raw = emails[0].values[0]?.value;
  return raw ? raw.toLowerCase().trim() : null;
}

// Extract comparison key per ContactSettings.fields, applying formatting/trim.
export function extractContactKey(entity: AmoEntity, settings: ContactSettings): string | null {
  if (settings.fields === 'name') {
    return entity.name?.toLowerCase().trim() || null;
  }
  if (settings.fields === 'email') {
    return extractEmail(entity);
  }
  // phone (default)
  let phone = extractPhone(entity);
  if (!phone) return null;
  if (settings.isFormatNumber && settings.checkNumberLength > 0) {
    phone = phone.slice(-settings.checkNumberLength);
  }
  return phone;
}

// Internal marker tag put on a duplicate after it has been merged away.
// amoCRM v4 has no delete API, so we tag + filter instead of deleting.
export const MERGED_TAG = 'merged_duplicate';

export function hasTag(entity: any, tagName: string): boolean {
  return (entity?._embedded?.tags || []).some((t: any) => t.name === tagName);
}

// Append a tag to entities using amoCRM's `tags_to_add` (does not drop existing tags).
export async function addTag(
  subdomain: string,
  entityType: 'contacts' | 'leads',
  ids: number[],
  tagName: string,
  accessToken: string,
): Promise<void> {
  for (const id of ids) {
    try {
      await amoRequest(subdomain, 'patch', `/api/v4/${entityType}/${id}`, accessToken, {
        tags_to_add: [{ name: tagName }],
      });
    } catch (err: any) {
      console.warn(`Failed to add tag to ${entityType}/${id}: ${err.message}`);
    }
  }
}

// Pick main entity by advantage strategy (used for auto-merge).
export function pickMainByAdvantage<T extends AmoEntity>(items: T[], advantage: string): T | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) =>
    advantage === 'oldest' ? a.updated_at - b.updated_at : b.updated_at - a.updated_at
  );
  return sorted[0];
}

export async function searchContactsByPhone(
  subdomain: string,
  phone: string,
  accessToken: string
): Promise<AmoEntity[]> {
  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/contacts?query=${encodeURIComponent(phone)}`,
    accessToken
  );
  const contacts = result._embedded?.contacts || [];
  return contacts.filter(contact => {
    const contactPhone = extractPhone(contact);
    return contactPhone === phone;
  });
}

// Settings-aware contact search. Picks the field (phone/email/name) from settings,
// normalizes both the search term and each candidate via extractContactKey, then matches.
export async function searchContacts(
  subdomain: string,
  term: string,
  accessToken: string,
  settings: ContactSettings,
): Promise<AmoEntity[]> {
  let key: string;
  if (settings.fields === 'phone') {
    key = term.replace(/\D/g, '');
    if (settings.isFormatNumber && settings.checkNumberLength > 0) {
      key = key.slice(-settings.checkNumberLength);
    }
  } else {
    key = term.toLowerCase().trim();
  }

  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/contacts?query=${encodeURIComponent(term)}`,
    accessToken,
  );
  const contacts = result._embedded?.contacts || [];
  return contacts.filter((c) => !hasTag(c, MERGED_TAG) && extractContactKey(c, settings) === key);
}

export async function searchLeadsByPhone(
  subdomain: string,
  phone: string,
  accessToken: string
): Promise<AmoEntity[]> {
  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/leads?query=${encodeURIComponent(phone)}`,
    accessToken
  );
  const leads = result._embedded?.leads || [];
  return leads.filter(lead => {
    if (hasTag(lead, MERGED_TAG)) return false;
    const leadPhone = extractPhone(lead);
    return leadPhone === phone;
  });
}

// Fetch every page of an amoCRM list endpoint. amoCRM returns max 250 per page;
// `_links.next` is present while more pages exist and absent on the last page
// (and a page beyond the data returns 204 → empty body). We stop on either signal.
async function fetchAllPages(
  subdomain: string,
  accessToken: string,
  path: 'contacts' | 'leads',
): Promise<AmoEntity[]> {
  const items: AmoEntity[] = [];
  const limit = 250;
  let page = 1;
  while (true) {
    const result = await amoRequest<any>(
      subdomain,
      'get',
      `/api/v4/${path}?limit=${limit}&page=${page}`,
      accessToken,
    );
    const pageItems: AmoEntity[] = result?._embedded?.[path] || [];
    items.push(...pageItems);
    const hasNext = !!result?._links?.next;
    if (pageItems.length < limit || !hasNext) break;
    page++;
  }
  return items;
}

export async function getAllContacts(subdomain: string, accessToken: string): Promise<AmoEntity[]> {
  const contacts = await fetchAllPages(subdomain, accessToken, 'contacts');
  return contacts.filter((c) => !hasTag(c, MERGED_TAG));
}


export async function mergeContacts(
  subdomain: string,
  mainId: number,
  duplicateIds: number[],
  accessToken: string,
  settings?: ContactSettings,
): Promise<void> {
  if (settings?.isTeg && settings.teg) {
    await addTag(subdomain, 'contacts', duplicateIds, settings.teg, accessToken);
    return;
  }
  for (const dupId of duplicateIds) {
    console.log(`\n==========`);
    console.log(`MERGING CONTACT ${dupId} -> ${mainId}`);
    console.log(`==========\n`);

    try {
      const duplicateContact = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/contacts/${dupId}?with=leads`,
        accessToken
      );

      const linkedLeads = duplicateContact._embedded?.leads || [];

      console.log(
        `Duplicate contact ${dupId} has ${linkedLeads.length} linked leads`
      );

      for (const lead of linkedLeads) {
        const leadId = lead.id;

        const leadData = await amoRequest<any>(
          subdomain,
          'get',
          `/api/v4/leads/${leadId}?with=contacts`,
          accessToken
        );

        const currentContacts =
          leadData._embedded?.contacts || [];

        console.log(
          `Lead ${leadId} current contacts:`,
          currentContacts.map((c: any) => c.id)
        );

        try {
          await amoRequest(
            subdomain,
            'post',
            `/api/v4/leads/${leadId}/unlink`,
            accessToken,
            [
              {
                to_entity_id: dupId,
                to_entity_type: 'contacts'
              }
            ]
          );

        } catch (unlinkErr: any) {
          console.warn(
            `Failed to unlink duplicate contact ${dupId} from lead ${leadId}:`,
            unlinkErr.message
          );
        }

        const mainAlreadyLinked = currentContacts.some(
          (c: any) => c.id === mainId
        );

        if (!mainAlreadyLinked) {
          try {
            await amoRequest(
              subdomain,
              'post',
              `/api/v4/leads/${leadId}/link`,
              accessToken,
              [
                {
                  to_entity_id: mainId,
                  to_entity_type: 'contacts',
                  metadata: {
                    is_main: true
                  }
                }
              ]
            );

          } catch (linkErr: any) {
            console.error(
              `Failed to link main contact ${mainId} to lead ${leadId}:`,
              linkErr.message
            );
          }
        } else {
          console.log(
            `Main contact ${mainId} already linked to lead ${leadId}`
          );
        }

        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const mainContact = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/contacts/${mainId}`,
        accessToken
      );

      const mainFields =
        mainContact.custom_fields_values || [];

      const dupFields =
        duplicateContact.custom_fields_values || [];

      const mergedFields = [...mainFields];

      for (const dupField of dupFields) {
        const exists = mergedFields.some(
          (field: any) =>
            field.field_id === dupField.field_id
        );

        if (!exists) {
          mergedFields.push(dupField);
        }
      }

      try {
        await amoRequest(
          subdomain,
          'patch',
          `/api/v4/contacts/${mainId}`,
          accessToken,
          {
            custom_fields_values: mergedFields
          }
        );

        console.log(`Main contact ${mainId} updated`);
      } catch (updateErr: any) {
        console.warn(
          `Failed to update main contact ${mainId}:`,
          updateErr.message
        );
      }

      await addTag(subdomain, 'contacts', [dupId], MERGED_TAG, accessToken);
      console.log(`Duplicate contact ${dupId} tagged as merged`);

      console.log(
        `CONTACT ${dupId} SUCCESSFULLY MERGED`
      );

    } catch (err: any) {

      console.log(err)

      console.error(
        `FAILED TO MERGE CONTACT ${dupId}:`,
        err.message
      );

      throw new Error(
        `Merge failed for contact ${dupId}: ${err.message}`
      );
    }
  }
}

export async function mergeLeads(
  subdomain: string,
  mainId: number,
  duplicateIds: number[],
  accessToken: string,
  settings?: LeadSettings,
): Promise<void> {
  if (settings?.isTeg && settings.teg) {
    await addTag(subdomain, 'leads', duplicateIds, settings.teg, accessToken);
    return;
  }
  for (const dupId of duplicateIds) {

    try {
      const mainLead = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/leads/${mainId}?with=contacts`,
        accessToken
      );

      const dupLead = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/leads/${dupId}?with=contacts`,
        accessToken
      );

      const updatePayload: any = {};

      if (!mainLead.name && dupLead.name) {
        updatePayload.name = dupLead.name;
      }

      if (!mainLead.price && dupLead.price) {
        updatePayload.price = dupLead.price;
      }

      if (!mainLead.responsible_user_id && dupLead.responsible_user_id) {
        updatePayload.responsible_user_id = dupLead.responsible_user_id;
      }

      const mainFields = mainLead.custom_fields_values || [];
      const dupFields = dupLead.custom_fields_values || [];

      const mergedFields = [...mainFields];

      for (const f of dupFields) {
        const exists = mergedFields.some((x: any) => x.field_id === f.field_id);
        if (!exists) mergedFields.push(f);
      }

      if (mergedFields.length) {
        updatePayload.custom_fields_values = mergedFields;
      }

      if (Object.keys(updatePayload).length > 0) {
        await amoRequest(
          subdomain,
          'patch',
          `/api/v4/leads/${mainId}`,
          accessToken,
          updatePayload
        );
      }

      const dupContacts = dupLead._embedded?.contacts || [];
      const mainContacts = mainLead._embedded?.contacts || [];

      for (const contact of dupContacts) {
        const exists = mainContacts.some((c: any) => c.id === contact.id);

        if (!exists) {
          await amoRequest(
            subdomain,
            'post',
            `/api/v4/leads/${mainId}/link`,
            accessToken,
            [
              {
                to_entity_id: contact.id,
                to_entity_type: 'contacts'
              }
            ]
          );
        }
      }

      const tasksRes = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/tasks?filter[entity_type]=leads&filter[entity_id]=${dupId}`,
        accessToken
      );

      const dupTasks = tasksRes._embedded?.tasks || [];

      for (const task of dupTasks) {    

    try {
        await amoRequest(
            subdomain,
            'post',
            `/api/v4/tasks`,
            accessToken,
            [  
                {
                    task_type_id: task.task_type_id,
                    text: task.text,
                    complete_till: task.complete_till,
                    responsible_user_id: task.responsible_user_id,
                    entity_id: mainId, 
                    entity_type: 'leads'      
                }
            ]
        );
    } catch (e: any) {
        console.warn(`Task copy failed: ${e.message}`);
    }
}
      await addTag(subdomain, 'leads', [dupId], MERGED_TAG, accessToken);
      console.log(`Duplicate lead ${dupId} tagged as merged`);

    } catch (err: any) {
      console.error(`FAILED MERGE ${dupId}:`, err.message);
      throw new Error(`Merge failed for lead ${dupId}: ${err.message}`);
    }
  }
}

export async function searchLeadsByName(
  subdomain: string,
  name: string,
  accessToken: string
): Promise<AmoEntity[]> {
  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/leads?query=${encodeURIComponent(name)}`,
    accessToken
  );
  const leads = result._embedded?.leads || [];
  return leads.filter(lead =>
    !hasTag(lead, MERGED_TAG) && lead.name && lead.name.toLowerCase() === name.toLowerCase()
  );
}

export async function getAllLeads(subdomain: string, accessToken: string): Promise<AmoEntity[]> {
  const leads = await fetchAllPages(subdomain, accessToken, 'leads');
  return leads.filter((l) => !hasTag(l, MERGED_TAG));
}

export function groupLeadsByName(leads: AmoEntity[]): Map<string, AmoEntity[]> {
  const groups = new Map<string, AmoEntity[]>();
  for (const lead of leads) {
    if (!lead.name) continue;
    const key = lead.name.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(lead);
  }
  const result = new Map<string, AmoEntity[]>();
  for (const [name, items] of groups.entries()) {
    if (items.length > 1) {
      items.sort((a, b) => b.updated_at - a.updated_at);
      result.set(name, items);
    }
  }
  return result;
}