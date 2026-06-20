import { api } from './client';

export const fetchHistory = (page = 1, limit = 50) =>
  api.get(`/history?page=${page}&limit=${limit}`).then((r) => ({
    rows: r.data || [],
    total: r.total || 0,
    page: r.page || page,
    limit: r.limit || limit,
  }));
