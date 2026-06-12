import { api } from './client';

// The authenticated account is derived from the widget key sent by the client.
export const fetchMe = () => api.get('/accounts/me').then((r) => r.data);
