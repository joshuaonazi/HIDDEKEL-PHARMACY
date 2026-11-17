import { api } from './client.js'

export const usersApi = {
  list: () => api.get('/users').then((r) => r.data.users),
  create: (body) => api.post('/users', body).then((r) => r.data),
  update: (id, body) => api.put(`/users/${id}`, body).then((r) => r.data.user),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`).then((r) => r.data),
}
