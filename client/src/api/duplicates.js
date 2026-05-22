import { api } from './client';

export const searchContactsByPhone = (subdomain, phone) =>
  api.post('/api/search', { type: 'contact', phone, subdomain });

export const searchLeadsByName = (subdomain, name) =>
  api.post('/api/search-leads-by-name', { name, subdomain });

export const findAllContactDuplicates = (subdomain) =>
  api.post('/api/find-all-duplicates', { type: 'contact', subdomain });

export const findAllLeadDuplicatesByName = (subdomain) =>
  api.post('/api/find-all-lead-duplicates-by-name', { subdomain });

export const mergeEntities = (subdomain, type, mainId, duplicateIds, snapshot = {}) =>
  api.post('/api/merge', { type, mainId, duplicateIds, subdomain, ...snapshot });
