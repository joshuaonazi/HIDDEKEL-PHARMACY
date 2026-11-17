import { api } from './client.js'

export const categoriesApi = {
  list: () => api.get('/categories').then((r) => r.data),
  create: (name) => api.post('/categories', { name }).then((r) => r.data),
  rename: (id, name) => api.put(`/categories/${id}`, { name }).then((r) => r.data),
  remove: (id) => api.delete(`/categories/${id}`).then((r) => r.data),
}

export const productsApi = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  get: (id) => api.get(`/products/${id}`).then((r) => r.data.product),
  byBarcode: (code) => api.get(`/products/barcode/${encodeURIComponent(code)}`).then((r) => r.data),
  create: (body) => api.post('/products', body).then((r) => r.data.product),
  update: (id, body) => api.put(`/products/${id}`, body).then((r) => r.data.product),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
  importRows: (rows) => api.post('/products/import', { rows }, { timeout: 60000 }).then((r) => r.data),
  stockImport: (rows, options) => api.post('/products/stock-import', { rows, ...options }, { timeout: 60000 }).then((r) => r.data),
}
