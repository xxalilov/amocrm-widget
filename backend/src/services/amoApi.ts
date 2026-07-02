import axios from 'axios';
import http from 'http';
import https from 'https';
import { AmoEntity, SearchResult } from '../types';
import { ContactSettings } from '../interfaces/contact-settings';
import { LeadSettings } from '../interfaces/lead-settings';
import { CompanySettings } from '../interfaces/company-settings';
import { RateLimiter } from '../utils/rateLimiter';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Shared client with keep-alive connection pooling (reused across all requests).
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const client = axios.create({ httpAgent, httpsAgent, timeout: 30_000 });

// 6 req/s per account with a burst of 6, safely under amoCRM's ~7 req/s cap.
// The burst lets paginated scans fetch several pages concurrently.
const limiter = new RateLimiter(6, 6);
const MAX_RETRIES = 4;

// How many list pages a scan fetches concurrently (bounded by the rate limiter).
const SCAN_PAGE_CONCURRENCY = 5;

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

// Comparison key for a company. Companies carry the same PHONE/EMAIL custom
// fields and a `name`, so the logic mirrors extractContactKey.
export function extractCompanyKey(entity: AmoEntity, settings: CompanySettings): string | null {
  if (settings.fields === 'name') {
    return entity.name?.toLowerCase().trim() || null;
  }
  if (settings.fields === 'email') {
    return extractEmail(entity);
  }
  // phone
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
  entityType: 'contacts' | 'leads' | 'companies',
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

// Settings-aware contact search. Picks the field (phone/email/name) from settings,
// normalizes both the search term and each candidate via extractContactKey, then matches.
export async function searchContacts(
  subdomain: string,
  term: string,
  accessToken: string,
  settings: ContactSettings,
): Promise<AmoEntity[]> {
  let key: string;
  let queryTerm: string;
  if (settings.fields === 'phone') {
    key = term.replace(/\D/g, '');
    if (settings.isFormatNumber && settings.checkNumberLength > 0) {
      key = key.slice(-settings.checkNumberLength);
    }
    if (!key) return [];
    // Query amoCRM by the normalized digits (the comparison key), NOT the raw
    // input. amoCRM's phone search matches by digit substring, so searching the
    // last-N digits (e.g. 909999999) finds both "909999999" and "+998909999999";
    // searching the raw "+998909999999" would miss a contact stored as "909999999".
    queryTerm = key;
  } else {
    key = term.toLowerCase().trim();
    queryTerm = term;
  }

  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/contacts?query=${encodeURIComponent(queryTerm)}`,
    accessToken,
  );
  const contacts = result._embedded?.contacts || [];
  return contacts.filter((c) => !hasTag(c, MERGED_TAG) && extractContactKey(c, settings) === key);
}

// Fetch every page of an amoCRM list endpoint. amoCRM returns max 250 per page;
// a page beyond the data returns 204 → empty body. Pages are fetched in
// concurrent waves (the rate limiter still caps total throughput); a short page
// marks the end. `onProgress` reports the running total to the background job.
async function fetchAllPages(
  subdomain: string,
  accessToken: string,
  path: 'contacts' | 'leads' | 'companies',
  onProgress?: (scanned: number) => void,
): Promise<AmoEntity[]> {
  const items: AmoEntity[] = [];
  const limit = 250;
  // Leads must be fetched with their linked contacts/companies, otherwise
  // `_embedded` is empty and duplicate grouping by contact/company finds nothing.
  const withParam = path === 'leads' ? '&with=contacts,companies' : '';

  let page = 1;
  let done = false;
  while (!done) {
    // Fire a wave of consecutive pages at once; the limiter throttles them.
    const pages = Array.from({ length: SCAN_PAGE_CONCURRENCY }, (_, i) => page + i);
    const waves = await Promise.all(
      pages.map((p) =>
        amoRequest<any>(
          subdomain,
          'get',
          `/api/v4/${path}?limit=${limit}&page=${p}${withParam}`,
          accessToken,
        ).then((result) => (result?._embedded?.[path] || []) as AmoEntity[]),
      ),
    );
    // Append in page order; a page shorter than the limit means we've reached the end.
    for (const pageItems of waves) {
      items.push(...pageItems);
      if (pageItems.length < limit) done = true;
    }
    onProgress?.(items.length);
    page += SCAN_PAGE_CONCURRENCY;
  }
  return items;
}

export async function getAllContacts(
  subdomain: string,
  accessToken: string,
  onProgress?: (scanned: number) => void,
): Promise<AmoEntity[]> {
  const contacts = await fetchAllPages(subdomain, accessToken, 'contacts', onProgress);
  return contacts.filter((c) => !hasTag(c, MERGED_TAG));
}

export async function getAllCompanies(
  subdomain: string,
  accessToken: string,
  onProgress?: (scanned: number) => void,
): Promise<AmoEntity[]> {
  const companies = await fetchAllPages(subdomain, accessToken, 'companies', onProgress);
  return companies.filter((c) => !hasTag(c, MERGED_TAG));
}

// Settings-aware company search (mirror of searchContacts).
export async function searchCompanies(
  subdomain: string,
  term: string,
  accessToken: string,
  settings: CompanySettings,
): Promise<AmoEntity[]> {
  let key: string;
  let queryTerm: string;
  if (settings.fields === 'phone') {
    key = term.replace(/\D/g, '');
    if (settings.isFormatNumber && settings.checkNumberLength > 0) {
      key = key.slice(-settings.checkNumberLength);
    }
    if (!key) return [];
    queryTerm = key; // query amoCRM by normalized digits (see searchContacts note)
  } else {
    key = term.toLowerCase().trim();
    queryTerm = term;
  }

  const result = await amoRequest<SearchResult>(
    subdomain,
    'get',
    `/api/v4/companies?query=${encodeURIComponent(queryTerm)}`,
    accessToken,
  );
  const companies = result._embedded?.companies || [];
  return companies.filter((c) => !hasTag(c, MERGED_TAG) && extractCompanyKey(c, settings) === key);
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

// API-based company merge — the FALLBACK path (tag mode, or when the SPA isn't
// embedded so the native штатный merge isn't available). The primary path is the
// browser native merge in script.js. Here we relink the duplicate's leads/contacts
// to the surviving company, copy over any missing custom fields, and tag the
// duplicate as merged (amoCRM v4 has no delete API).
export async function mergeCompanies(
  subdomain: string,
  mainId: number,
  duplicateIds: number[],
  accessToken: string,
  settings?: CompanySettings,
): Promise<void> {
  if (settings?.isTeg && settings.teg) {
    await addTag(subdomain, 'companies', duplicateIds, settings.teg, accessToken);
    return;
  }

  for (const dupId of duplicateIds) {
    try {
      // Relink everything linked to the duplicate company (leads, contacts,
      // customers) onto the surviving company.
      try {
        const links = await amoRequest<any>(
          subdomain, 'get', `/api/v4/companies/${dupId}/links`, accessToken,
        );
        const entities = links._embedded?.links || [];
        const toLink = entities
          .filter((l: any) => l.to_entity_id && l.to_entity_type)
          .map((l: any) => ({ to_entity_id: l.to_entity_id, to_entity_type: l.to_entity_type }));
        if (toLink.length) {
          await amoRequest(subdomain, 'post', `/api/v4/companies/${mainId}/link`, accessToken, toLink);
        }
      } catch (linkErr: any) {
        console.warn(`Company link copy ${dupId}->${mainId} failed: ${linkErr.message}`);
      }

      // Copy custom fields the surviving company is missing.
      const dupCompany = await amoRequest<any>(subdomain, 'get', `/api/v4/companies/${dupId}`, accessToken);
      const mainCompany = await amoRequest<any>(subdomain, 'get', `/api/v4/companies/${mainId}`, accessToken);
      const mergedFields = [...(mainCompany.custom_fields_values || [])];
      for (const dupField of (dupCompany.custom_fields_values || [])) {
        if (!mergedFields.some((f: any) => f.field_id === dupField.field_id)) {
          mergedFields.push(dupField);
        }
      }
      if (mergedFields.length) {
        try {
          await amoRequest(subdomain, 'patch', `/api/v4/companies/${mainId}`, accessToken, {
            custom_fields_values: mergedFields,
          });
        } catch (updateErr: any) {
          console.warn(`Failed to update main company ${mainId}: ${updateErr.message}`);
        }
      }

      await addTag(subdomain, 'companies', [dupId], MERGED_TAG, accessToken);
      console.log(`Duplicate company ${dupId} tagged as merged`);
    } catch (err: any) {
      console.error(`FAILED TO MERGE COMPANY ${dupId}:`, err.message);
      throw new Error(`Merge failed for company ${dupId}: ${err.message}`);
    }
  }
}

// The "data winner" of two leads by create date, per the advantage setting.
function leadDataWinner(a: any, b: any, advantage: string): any {
  const ac = a.created_at ?? 0;
  const bc = b.created_at ?? 0;
  // 'oldest' => earliest created wins; 'newest' (default) => latest created wins.
  if (advantage === 'oldest') return ac <= bc ? a : b;
  return ac >= bc ? a : b;
}

// Builds the patch for the surviving main lead: scalar fields and custom fields
// are taken from the winner, falling back to the loser only where the winner is
// empty. Returns only the keys that actually differ from the current main.
function buildLeadFieldUpdate(mainLead: any, dupLead: any, advantage: string): any {
  const winner = leadDataWinner(mainLead, dupLead, advantage);
  const loser = winner === mainLead ? dupLead : mainLead;
  const payload: any = {};

  const name = winner.name || loser.name;
  if (name && name !== mainLead.name) payload.name = name;

  const price = winner.price || loser.price;
  if (price && price !== mainLead.price) payload.price = price;

  const responsible = winner.responsible_user_id || loser.responsible_user_id;
  if (responsible && responsible !== mainLead.responsible_user_id) {
    payload.responsible_user_id = responsible;
  }

  // Custom fields: union by field_id, winner takes precedence on conflict.
  const byId = new Map<any, any>();
  for (const f of (loser.custom_fields_values || [])) byId.set(f.field_id, f);
  for (const f of (winner.custom_fields_values || [])) byId.set(f.field_id, f);
  const merged = [...byId.values()];
  if (merged.length) payload.custom_fields_values = merged;

  return payload;
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

      // Field-value priority: `advantage` picks whose data wins by create date
      // ('newest' = last created, 'oldest' = first created). The winner's values
      // overwrite the surviving main lead; the loser only fills what the winner lacks.
      const updatePayload = buildLeadFieldUpdate(mainLead, dupLead, settings?.advantage || 'newest');

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

export async function getAllLeads(
  subdomain: string,
  accessToken: string,
  onProgress?: (scanned: number) => void,
): Promise<AmoEntity[]> {
  const leads = await fetchAllPages(subdomain, accessToken, 'leads', onProgress);
  return leads.filter((l) => !hasTag(l, MERGED_TAG));
}

