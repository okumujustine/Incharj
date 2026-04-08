import apiClient from './api'
import type { AuthResponse, SetupPayload } from '../types'

export const setupService = {
  async status(): Promise<{ initialized: boolean }> {
    const response = await apiClient.get<{ initialized: boolean }>('/setup/status')
    return response.data
  },

  async initialize(payload: SetupPayload): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/setup', payload)
    return response.data
  },
}
