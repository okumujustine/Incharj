import apiClient from './api'
import type { SearchResponse, SearchFilters } from '../types'

export const searchService = {
  async search(
    orgSlug: string,
    query: string,
    filters: SearchFilters = {}
  ): Promise<SearchResponse> {
    const params: Record<string, string | number> = {
      q: query,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    }

    if (filters.connector_id) params['connector_id'] = filters.connector_id
    if (filters.kind) params['kind'] = filters.kind
    if (filters.date_from) params['date_from'] = filters.date_from
    if (filters.date_to) params['date_to'] = filters.date_to

    const response = await apiClient.get<SearchResponse>(
      `/orgs/${orgSlug}/search`,
      { params }
    )
    return response.data
  },
}
