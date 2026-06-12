import { api } from './client';

export const fetchPipelines = () =>
  api.get('/pipelines').then((r) => r.data);
