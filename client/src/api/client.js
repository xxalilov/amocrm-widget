// Backend base URL. Empty for the unified deployment (same origin / dev proxy);
// in the split deployment it's the API origin, baked in at build time via
// REACT_APP_API_BASE_URL (a Docker build arg for the client image).
export const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

// The per-account widget key, used as a Bearer token on every API call. It is
// delivered to the iframe via the URL (set by the amoCRM widget settings).
//
// SECURITY: the key MUST be scoped to the current account (subdomain). A single
// global localStorage key leaks data across accounts — when account B opens the
// widget in a browser that previously held account A's key, B would silently use
// A's key and see A's data. So we key storage by subdomain and never fall back to
// another account's key.
let apiKey = null;
let currentSubdomain = null;

// One-time cleanup of the old, unscoped key that caused the cross-account leak.
try { localStorage.removeItem('widget_key'); } catch (e) {}

export function setAccountContext(subdomain) {
  currentSubdomain = subdomain || null;
}

function storageKey() {
  return currentSubdomain ? `widget_key:${currentSubdomain}` : null;
}

export function setApiKey(key) {
  apiKey = key || null;
  try {
    const sk = storageKey();
    if (key && sk) localStorage.setItem(sk, key);
  } catch (e) {}
}

export function getApiKey() {
  if (apiKey) return apiKey;
  try {
    const sk = storageKey();
    return sk ? localStorage.getItem(sk) : null;
  } catch (e) {
    return null;
  }
}

async function request(path, options = {}) {
  const key = getApiKey();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Old, secure path: a manually-entered widget key (Bearer). Still works.
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      // Zero-setup path: identify the account by its amoCRM subdomain (passed by
      // the widget as ?account=). The backend uses this only when no valid key is
      // present, so installing the widget works without copying a key.
      ...(currentSubdomain ? { 'X-Account-Subdomain': currentSubdomain } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    const err = new Error('AUTH_REQUIRED');
    err.status = 401;
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  get: (path) => request(path),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
};
