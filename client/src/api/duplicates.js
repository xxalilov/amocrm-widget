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
// Used for tag-mode and as a fallback when not embedded (see native merge below).
export const mergeEntities = (type, mainId, duplicateIds, snapshot = {}) =>
  api.post('/api/merge', { type, mainId, duplicateIds, ...snapshot });

// ── Native (штатный) merge bridge ─────────────────────────────────────────
// amoCRM's real merge runs only on the amoCRM origin via the logged-in session,
// so the backend can't call it. When we're embedded in the widget iframe we ask
// the host (widget/script.js) to perform it and await the result over
// postMessage. See native-merge-protocol.
const NATIVE_TIMEOUT_MS = 120000;
let nativeReqSeq = 0;
const nativePending = new Map();

export const canNativeMerge = () => {
  try { return !!window.parent && window.parent !== window; } catch (e) { return false; }
};

if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || msg.source !== 'dedup-host') return;
    const p = nativePending.get(msg.reqId);
    if (!p) return;
    nativePending.delete(msg.reqId);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve();
    else p.reject(new Error(msg.error || 'Не удалось объединить'));
  });
}

// Ask the host to merge `mainId` + `duplicateIds` natively. `ids` sent to the
// host must include the surviving record.
export function nativeMergeViaHost(type, mainId, duplicateIds) {
  return new Promise((resolve, reject) => {
    if (!canNativeMerge()) { reject(new Error('Виджет не встроен в amoCRM')); return; }
    const reqId = `m${++nativeReqSeq}_${Math.round(performance.now())}`;
    const timer = setTimeout(() => {
      nativePending.delete(reqId);
      reject(new Error('Хост виджета не ответил'));
    }, NATIVE_TIMEOUT_MS);
    nativePending.set(reqId, { resolve, reject, timer });
    const ids = [mainId, ...duplicateIds].map(String);
    // targetOrigin '*' is safe here — the payload is only entity ids, and the
    // host validates the message origin before acting.
    window.parent.postMessage({ source: 'dedup-spa', action: 'merge', reqId, type, mainId, ids }, '*');
  });
}

// Record a natively-performed merge in history (backend isn't otherwise involved).
export const logMerge = (type, mainId, duplicateIds, snapshot = {}) =>
  api.post('/api/merge/log', { type, mainId, duplicateIds, ...snapshot });

// Merge many groups in the background; returns { jobId }. Poll with pollJob.
// `groups`: [{ mainId, duplicateIds, mainName, duplicates }]
export const startMergeAll = (type, groups) =>
  api.post('/api/merge-all', { type, groups });
