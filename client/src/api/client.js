async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
