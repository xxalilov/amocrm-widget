import { api } from './client';

export const fetchAccountBySubdomain = (subdomain) =>
  api.get(`/accounts/${encodeURIComponent(subdomain)}`).then((r) => r.data);

export const checkAuth = (subdomain) =>
  api.get(`/api/check-auth?subdomain=${encodeURIComponent(subdomain)}`);
