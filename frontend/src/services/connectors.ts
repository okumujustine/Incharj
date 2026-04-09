import apiClient from './api'
import type { Connector, SyncJob, DocumentsResponse } from '../types'

interface CreateConnectorPayload {
  kind: 'google_drive' | 'slack'
  name: string
  credentials?: Record<string, string>
}

interface UpdateConnectorPayload {
  name?: string
  config?: Record<string, unknown>
}

export const connectorsService = {
  async list(orgSlug: string): Promise<Connector[]> {
    const response = await apiClient.get<Connector[]>(`/orgs/${orgSlug}/connectors`)
    return response.data
  },

  async create(orgSlug: string, payload: CreateConnectorPayload): Promise<Connector> {
    const response = await apiClient.post<Connector>(
      `/orgs/${orgSlug}/connectors`,
      payload
    )
    return response.data
  },

  async get(orgSlug: string, connectorId: string): Promise<Connector> {
    const response = await apiClient.get<Connector>(
      `/connectors/${connectorId}`,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async update(
    orgSlug: string,
    connectorId: string,
    payload: UpdateConnectorPayload
  ): Promise<Connector> {
    const response = await apiClient.patch<Connector>(
      `/connectors/${connectorId}`,
      payload,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async delete(orgSlug: string, connectorId: string): Promise<void> {
    await apiClient.delete(`/connectors/${connectorId}`, { params: { org: orgSlug } })
  },

  async sync(orgSlug: string, connectorId: string): Promise<SyncJob> {
    const response = await apiClient.post<SyncJob>(
      `/connectors/${connectorId}/sync`,
      null,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async pause(orgSlug: string, connectorId: string): Promise<Connector> {
    const response = await apiClient.post<Connector>(
      `/connectors/${connectorId}/pause`,
      null,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async resume(orgSlug: string, connectorId: string): Promise<Connector> {
    const response = await apiClient.post<Connector>(
      `/connectors/${connectorId}/resume`,
      null,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async resetSync(orgSlug: string, connectorId: string): Promise<Connector> {
    const response = await apiClient.post<Connector>(
      `/connectors/${connectorId}/reset-sync`,
      null,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async cancelSyncJob(orgSlug: string, jobId: string): Promise<void> {
    await apiClient.post(`/sync/jobs/${jobId}/cancel`, null, { params: { org: orgSlug } })
  },

  async clearSyncHistory(orgSlug: string, connectorId: string): Promise<void> {
    await apiClient.delete('/sync/jobs', { params: { org: orgSlug, connector_id: connectorId } })
  },

  async connect(orgSlug: string, connectorId: string): Promise<Connector> {
    const response = await apiClient.post<Connector>(
      `/connectors/${connectorId}/connect`,
      null,
      { params: { org: orgSlug } }
    )
    return response.data
  },

  async listDocuments(
    orgSlug: string,
    connectorId: string,
    opts: { status?: string; limit?: number; offset?: number } = {}
  ): Promise<DocumentsResponse> {
    const response = await apiClient.get<DocumentsResponse>('/documents', {
      params: {
        org: orgSlug,
        connector_id: connectorId,
        status: opts.status,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0,
      },
    })
    return response.data
  },

  async listSyncJobs(orgSlug: string, connectorId: string): Promise<SyncJob[]> {
    const response = await apiClient.get<SyncJob[]>(
      `/sync/jobs`,
      { params: { org: orgSlug, connector_id: connectorId } }
    )
    return response.data
  },

  async getOAuthUrl(
    orgSlug: string,
    kind: 'google_drive',
    connectorId?: string
  ): Promise<{ url: string; state: string }> {
    const params: Record<string, string> = { org: orgSlug }
    if (connectorId) params.connector_id = connectorId
    const response = await apiClient.get<{ authorization_url: string; state: string }>(
      `/oauth/${kind}/authorize`,
      { params }
    )
    return { url: response.data.authorization_url, state: response.data.state }
  },

  async handleOAuthCallback(
    kind: string,
    code: string,
    state: string,
    connectorId: string,
    orgSlug: string
  ): Promise<Connector> {
    const response = await apiClient.get<Connector>(`/oauth/${kind}/callback`, {
      params: { code, state, connector_id: connectorId, org: orgSlug },
    })
    return response.data
  },
}
