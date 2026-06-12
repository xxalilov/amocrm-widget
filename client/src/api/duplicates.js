import { api } from './client';

export const searchContactsByPhone = (phone) =>
  api.post('/api/search', { type: 'contact', phone });

export const searchLeadsByName = (name) =>
  api.post('/api/search-leads-by-name', { name });

// Find-all is a potentially minutes-long scan, so the server runs it as a
// background job: these endpoints return { jobId }, and the client polls
// /api/jobs/:jobId until the scan is done.
export const startFindAllContactDuplicates = () =>
  api.post('/api/find-all-duplicates', { type: 'contact' });

// Leads are grouped per the account's Lead Settings (by contact or company).
export const startFindAllLeadDuplicates = () =>
  api.post('/api/find-all-duplicates', { type: 'lead' });

export const getJobStatus = (jobId) => api.get(`/api/jobs/${jobId}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls a background job (scan or merge) until it finishes. Calls onProgress(job)
// on each tick. Returns the completed job; throws on job error.
export async function pollJob(jobId, { onProgress, intervalMs = 1500, shouldCancel } = {}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (shouldCancel?.()) return null;
    const job = await getJobStatus(jobId);
    onProgress?.(job);
    if (job.status === 'done') return job;
    if (job.status === 'error') {
      const err = new Error(job.error || 'Job failed');
      throw err;
    }
    await sleep(intervalMs);
  }
}

// Single-group merge (one row) — fast, runs synchronously on the server.
export const mergeEntities = (type, mainId, duplicateIds, snapshot = {}) =>
  api.post('/api/merge', { type, mainId, duplicateIds, ...snapshot });

// Merge many groups in the background; returns { jobId }. Poll with pollJob.
// `groups`: [{ mainId, duplicateIds, mainName, duplicates }]
export const startMergeAll = (type, groups) =>
  api.post('/api/merge-all', { type, groups });
