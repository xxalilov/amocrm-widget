import { api } from './client';

export const fetchHistory = (accountId) =>
  api.get(`/history/${accountId}`).then((r) => r.data);
