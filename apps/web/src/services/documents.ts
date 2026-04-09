import apiClient from './api'
import type { Document } from '../types'

interface ListDocumentsParams {
  connector_id?: string
  kind?: string
  limit?: number
  offset?: number
}

export interface DocumentsPage {
  total: number
  limit: number
  offset: number
  results: Document[]
}

export const documentsService = {
  async list(orgSlug: string, params: ListDocumentsParams = {}): Promise<DocumentsPage> {
    const response = await apiClient.get<DocumentsPage>('/documents', {
      params: { org: orgSlug, ...params },
    })
    return response.data
  },

  async get(orgSlug: string, documentId: string): Promise<Document> {
    const response = await apiClient.get<Document>(`/documents/${documentId}`, {
      params: { org: orgSlug },
    })
    return response.data
  },
}
