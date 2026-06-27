import { api } from './client';

// Read-only status of the background auto-merge loop, per entity type:
// { contact: {enabled, interval, lastRunAt, nextDueAt, lastMerged, lastFailed, running}, lead: {...} }
export const fetchAutoStatus = () =>
  api.get('/auto/status').then((r) => r.data);
