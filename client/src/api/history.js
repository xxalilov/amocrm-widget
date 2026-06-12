import { api } from './client';

export const fetchHistory = () =>
  api.get('/history').then((r) => r.data);
