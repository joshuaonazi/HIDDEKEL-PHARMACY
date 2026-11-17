import axios from 'axios'

const KEY = 'hp_token'

// "Remember me" keeps the token across browser restarts (localStorage);
// otherwise it lasts only until the tab is closed (sessionStorage).
export const tokenStore = {
  get: () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY),
  set: (token, remember) => {
    tokenStore.clear()
    ;(remember ? localStorage : sessionStorage).setItem(KEY, token)
  },
  // Swaps in a fresh token (after a password change) in whichever storage already holds one
  replace: (token) => {
    const target = localStorage.getItem(KEY) ? localStorage : sessionStorage
    target.setItem(KEY, token)
  },
  clear: () => {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(KEY)
  },
}

export const api = axios.create({ baseURL: '/api', timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    // An expired or invalid session anywhere except the login call signs the user out
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      tokenStore.clear()
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error.response?.data
  if (data?.details?.length) return `${data.error}: ${data.details.map((d) => d.message).join(', ')}`
  if (data?.error) return data.error
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return fallback
}
