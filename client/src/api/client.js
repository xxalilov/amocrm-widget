// The per-account widget key, used as a Bearer token on every API call. It is
// delivered to the iframe via the URL (set by the amoCRM widget settings) and
// cached so it survives in-app reloads.
let apiKey = null;

export function setApiKey(key) {
  apiKey = key || null;
  try {
    if (key) localStorage.setItem('widget_key', key);
  } catch (e) {}
}

export function getApiKey() {
  if (apiKey) return apiKey;
  try {
    return localStorage.getItem('widget_key');
  } catch (e) {
    return null;
  }
}

async function request(path, options = {}) {
  const key = getApiKey();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
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
