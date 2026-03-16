import apiClient from './api'
import type { Document } from '../types'

interface ListDocumentsParams {
  connector_id?: string
  kind?: string
  limit?: number
  offset?: number
}

export const documentsService = {
  async list(orgSlug: string, params: ListDocumentsParams = {}): Promise<Document[]> {
    const response = await apiClient.get<Document[]>(
      `/orgs/${orgSlug}/documents`,
      { params }
    )
    return response.data
  },

  async get(orgSlug: string, documentId: string): Promise<Document> {
    const response = await apiClient.get<Document>(
      `/orgs/${orgSlug}/documents/${documentId}`
    )
    return response.data
  },
}
