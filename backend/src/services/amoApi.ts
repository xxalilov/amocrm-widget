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
    console.log(`Dublikat kontakt qayta ishlanmoqda: ${dupId}`);
    try {
      const leadsResponse = await amoRequest<any>(
        subdomain,
        'get',
        `/api/v4/leads?filter[contacts][id]=${dupId}`,
        accessToken
      );
      const leads = leadsResponse._embedded?.leads || [];

      for (const lead of leads) {
        const leadId = lead.id;
        const leadDetails = await amoRequest<any>(
          subdomain,
          'get',
          `/api/v4/leads/${leadId}`,
          accessToken
        );
        const currentContacts = leadDetails._embedded?.contacts || [];

        const updatedContacts = currentContacts.map((c: any) =>
          c.id === dupId ? { ...c, id: mainId, is_main: c.is_main } : c
        );

        await amoRequest(
          subdomain,
          'patch',
          `/api/v4/leads/${leadId}`,
          accessToken,
          { _embedded: { contacts: updatedContacts } }
        );

        await new Promise(resolve => setTimeout(resolve, 200));
      }

        await amoRequest(
          subdomain,
          'patch',
          `/api/v4/contacts/${dupId}`,
           accessToken,
          { status: 'archived' }
        );

    } catch (error: any) {
      console.error(`Dublikat ${dupId} ni qayta ishlashda xatolik:`, error.message);
      throw new Error(`Kontaktni birlashtirishda xatolik ${dupId}: ${error.message}`);
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
    console.log(`Birlashtirilmoqda: dublikat lead ${dupId} → asosiy ${mainId}`);
    try {
      const mainLead = await amoRequest<any>(subdomain, 'get', `/api/v4/leads/${mainId}`, accessToken);
      const dupLead = await amoRequest<any>(subdomain, 'get', `/api/v4/leads/${dupId}`, accessToken);

      const updatePayload: any = {};
      if (!mainLead.name && dupLead.name) updatePayload.name = dupLead.name;
      if (!mainLead.price && dupLead.price) updatePayload.price = dupLead.price;
      if (!mainLead.responsible_user_id && dupLead.responsible_user_id)
        updatePayload.responsible_user_id = dupLead.responsible_user_id;

      const mainCustom = mainLead.custom_fields_values || [];
      const dupCustom = dupLead.custom_fields_values || [];
      const mergedCustom = [...mainCustom];
      for (const dupField of dupCustom) {
        const exists = mergedCustom.some((f: any) => f.field_id === dupField.field_id);
        if (!exists) mergedCustom.push(dupField);
      }
      if (mergedCustom.length) updatePayload.custom_fields_values = mergedCustom;

      if (Object.keys(updatePayload).length) {
        await amoRequest(subdomain, 'patch', `/api/v4/leads/${mainId}`, accessToken, updatePayload);
        console.log(`Asosiy lead ${mainId} yangilandi`);
      }

      try {
        const notesResponse = await amoRequest<any>(
          subdomain,
          'get',
          `/api/v4/notes?filter[entity_id]=${dupId}&filter[entity_type]=leads`,
          accessToken
        );
        const notes = notesResponse._embedded?.notes || [];
        for (const note of notes) {
          await amoRequest(subdomain, 'post', `/api/v4/notes`, accessToken, {
            entity_id: mainId,
            entity_type: 'leads',
            note_type: note.note_type,
            text: note.text,
            params: note.params
          });
        }
        console.log(`${notes.length} ta nota ko‘chirildi`);
      } catch (e: any) { console.warn(`Nota ko‘chirishda xatolik: ${e.message}`); }

      try {
        const tasksResponse = await amoRequest<any>(
          subdomain,
          'get',
          `/api/v4/tasks?filter[entity_id]=${dupId}&filter[entity_type]=leads`,
          accessToken
        );
        const tasks = tasksResponse._embedded?.tasks || [];
        for (const task of tasks) {
          await amoRequest(subdomain, 'post', `/api/v4/tasks`, accessToken, {
            entity_id: mainId,
            entity_type: 'leads',
            task_type_id: task.task_type_id,
            text: task.text,
            complete_till: task.complete_till,
            responsible_user_id: task.responsible_user_id
          });
        }
        console.log(`${tasks.length} ta task ko‘chirildi`);
      } catch (e: any) { console.warn(`Task ko‘chirishda xatolik: ${e.message}`); }

      try {
        const newName = `[MERGED ${new Date().toISOString().slice(0,19)}] ${dupLead.name || 'Lead'}`;
        await amoRequest(subdomain, 'patch', `/api/v4/leads/${dupId}`, accessToken, {
          name: newName,
        });

        await amoRequest(subdomain, 'patch', `/api/v4/leads/${dupId}`, accessToken, {
          _embedded: { contacts: [] }
        });
        console.log(`Dublikat lead ${dupId} dan kontaktlar olib tashlandi`);
      } catch (e: any) {
        console.warn(`Leadni yashirishda xatolik: ${e.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err: any) {
      console.error(`Lead ${dupId} ni birlashtirishda xatolik:`, err.message);
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