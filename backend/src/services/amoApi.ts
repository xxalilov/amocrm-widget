import axios from 'axios';
import { AmoEntity, SearchResult } from '../types';

export async function amoRequest<T>(
  subdomain: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  accessToken: string,
  data?: any
): Promise<T> {
  const instance = axios.create({
    baseURL: `https://${subdomain}.amocrm.ru`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const response = await instance({ method, url, data });
  return response.data;
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
    const leadPhone = extractPhone(lead);
    return leadPhone === phone;
  });
}

export async function getAllContacts(subdomain: string, accessToken: string): Promise<AmoEntity[]> {
  let contacts: AmoEntity[] = [];
  let page = 1;
  const limit = 250;
  let hasMore = true;
  while (hasMore) {
    const result = await amoRequest<any>(subdomain, 'get', `/api/v4/contacts?limit=${limit}&page=${page}`, accessToken);
    const pageContacts = result._embedded?.contacts || [];
    contacts.push(...pageContacts);
    hasMore = pageContacts.length === limit;
    page++;
  }
  return contacts;
}


export async function mergeContacts(
  subdomain: string,
  mainId: number,
  duplicateIds: number[],
  accessToken: string
): Promise<void> {
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

      try {
        const mergedName =
          `[MERGED ${new Date()
            .toISOString()
            .slice(0, 19)}] ` +
          (duplicateContact.name || `CONTACT ${dupId}`);

        await amoRequest(
          subdomain,
          'patch',
          `/api/v4/contacts/${dupId}`,
          accessToken,
          {
            name: mergedName
          }
        );

        console.log(
          `Duplicate contact ${dupId} renamed`
        );
      } catch (renameErr: any) {
        console.warn(
          `Failed to rename duplicate contact ${dupId}:`,
          renameErr.message
        );
      }

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
  accessToken: string
): Promise<void> {
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
      const mergedName = `[MERGED ${new Date().toISOString().slice(0, 19)}] ${
        dupLead.name || `LEAD ${dupId}`
      }`;

      await amoRequest(
        subdomain,
        'patch',
        `/api/v4/leads/${dupId}`,
        accessToken,
        {
          name: mergedName,
          _embedded: { contacts: [] }
        }
      );

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
    lead.name && lead.name.toLowerCase() === name.toLowerCase()
  );
}

export async function getAllLeads(subdomain: string, accessToken: string): Promise<AmoEntity[]> {
  let leads: AmoEntity[] = [];
  let page = 1;
  const limit = 250;
  let hasMore = true;
  while (hasMore) {
    const result = await amoRequest<any>(subdomain, 'get', `/api/v4/leads?limit=${limit}&page=${page}`, accessToken);

    const pageLeads = result._embedded?.leads || [];

    leads.push(...pageLeads);
    hasMore = pageLeads.length === limit;
    page++;
  }
  return leads;
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