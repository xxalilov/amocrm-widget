import { api } from './client';

export const fetchPipelines = (subdomain) =>
  api.get(`/pipelines/${encodeURIComponent(subdomain)}`).then((r) => r.data);
