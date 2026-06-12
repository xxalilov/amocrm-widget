import { api } from './client';

export const fetchContactSettings = () =>
  api.get('/contact-settings').then((r) => r.data);

export const updateContactSettings = (patch) =>
  api.put('/contact-settings', patch).then((r) => r.data);

export const fetchLeadSettings = () =>
  api.get('/lead-settings').then((r) => r.data);

export const updateLeadSettings = (patch) =>
  api.put('/lead-settings', patch).then((r) => r.data);
