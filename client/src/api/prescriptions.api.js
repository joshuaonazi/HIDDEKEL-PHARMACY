import { api } from './client.js'

export const prescriptionsApi = {
  list: (params) => api.get('/prescriptions', { params }).then((r) => r.data),
  get: (id) => api.get(`/prescriptions/${id}`).then((r) => r.data.prescription),
  create: (body) => api.post('/prescriptions', body).then((r) => r.data.prescription),
  update: (id, body) => api.put(`/prescriptions/${id}`, body).then((r) => r.data.prescription),
  cancel: (id, reason) => api.post(`/prescriptions/${id}/cancel`, { reason }).then((r) => r.data.prescription),
  repeat: (id) => api.post(`/prescriptions/${id}/repeat`).then((r) => r.data.prescription),
  customerHistory: (params) => api.get('/prescriptions/customer/history', { params }).then((r) => r.data),
}
