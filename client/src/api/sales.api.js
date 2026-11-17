import { api } from './client.js'

export const salesApi = {
  quote: (body) => api.post('/sales/quote', body).then((r) => r.data),
  create: (body) => api.post('/sales', body).then((r) => r.data.sale),
  get: (id) => api.get(`/sales/${id}`).then((r) => r.data.sale),
  list: (params) => api.get('/sales', { params }).then((r) => r.data),
  void: (id, reason) => api.post(`/sales/${id}/void`, { reason }).then((r) => r.data.sale),
}

export const settingsApi = {
  get: () => api.get('/settings').then((r) => r.data.settings),
  update: (body) => api.put('/settings', body).then((r) => r.data.settings),
}