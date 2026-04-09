import axios, { type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/authStore'

const BASE_URL = '/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // needed for httpOnly refresh cookie
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const REFRESH_EXCLUDED_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

function shouldAttemptRefresh(config?: AxiosRequestConfig & { _retry?: boolean }) {
  if (!config || config._retry) return false

  const url = config.url ?? ''
  return !REFRESH_EXCLUDED_PATHS.some((path) => url.includes(path))
}

// Request interceptor: inject access token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401 + token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && shouldAttemptRefresh(originalRequest)) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`
          }
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const response = await apiClient.post('/auth/refresh')
        const { access_token } = response.data
        useAuthStore.getState().updateToken(access_token)
        processQueue(null, access_token)

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
