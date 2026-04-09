import apiClient from './api'

export interface SlackInstallation {
  connected: boolean
  team_id?: string
  team_name?: string
  installed_at?: string
}

export const slackService = {
  async getInstallation(orgSlug: string): Promise<SlackInstallation> {
    const res = await apiClient.get<SlackInstallation>(`/orgs/${orgSlug}/slack`)
    return res.data
  },

  async getInstallUrl(): Promise<string> {
    const res = await apiClient.get<{ url: string }>('/slack/oauth/install')
    return res.data.url
  },

  async disconnect(orgSlug: string): Promise<void> {
    await apiClient.delete(`/orgs/${orgSlug}/slack`)
  },
}
