import { api } from './client';

export const fetchContactSettings = (accountId) =>
  api.get(`/contact-settings/${accountId}`).then((r) => r.data);

export const updateContactSettings = (accountId, patch) =>
  api.put(`/contact-settings/${accountId}`, patch).then((r) => r.data);

export const fetchLeadSettings = (accountId) =>
  api.get(`/lead-settings/${accountId}`).then((r) => r.data);

export const updateLeadSettings = (accountId, patch) =>
  api.put(`/lead-settings/${accountId}`, patch).then((r) => r.data);
