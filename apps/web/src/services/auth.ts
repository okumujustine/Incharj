import apiClient from './api'
import type { User, LoginPayload, RegisterPayload, AuthResponse } from '../types'

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', payload)
    return response.data
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', payload)
    return response.data
  },

  async me(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me')
    return response.data
  },

  async refresh(): Promise<{ access_token: string }> {
    const response = await apiClient.post<{ access_token: string }>('/auth/refresh')
    return response.data
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout')
  },

  async acceptInvite(token: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(`/invitations/${token}/accept`)
    return response.data
  },
}
