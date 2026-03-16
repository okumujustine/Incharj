import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchService } from '../services/search'
import type { SearchFilters, SearchResult } from '../types'

interface UseSearchOptions {
  orgSlug: string
  debounceMs?: number
}

export function useSearch({ orgSlug, debounceMs = 300 }: UseSearchOptions) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
      setSelectedIndex(-1)
    }, debounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, debounceMs])

  const searchQuery = useQuery({
    queryKey: ['search', orgSlug, debouncedQuery, filters],
    queryFn: () => searchService.search(orgSlug, debouncedQuery, filters),
    enabled: !!orgSlug && debouncedQuery.trim().length > 0,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })

  const navigateResults = useCallback(
    (direction: 'up' | 'down') => {
      const results = searchQuery.data?.results ?? []
      if (results.length === 0) return

      setSelectedIndex((prev) => {
        if (direction === 'down') {
          return prev < results.length - 1 ? prev + 1 : prev
        } else {
          return prev > 0 ? prev - 1 : 0
        }
      })
    },
    [searchQuery.data]
  )

  const openSelected = useCallback(
    (results: SearchResult[]) => {
      if (selectedIndex >= 0 && results[selectedIndex]?.url) {
        window.open(results[selectedIndex].url!, '_blank')
      }
    },
    [selectedIndex]
  )

  const updateFilter = useCallback(
    (key: keyof SearchFilters, value: string | number | undefined) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
      setSelectedIndex(-1)
    },
    []
  )

  const clearFilters = useCallback(() => {
    setFilters({})
  }, [])

  return {
    query,
    setQuery,
    filters,
    updateFilter,
    clearFilters,
    selectedIndex,
    setSelectedIndex,
    navigateResults,
    openSelected,
    results: searchQuery.data?.results ?? [],
    total: searchQuery.data?.total ?? 0,
    isLoading: searchQuery.isLoading || searchQuery.isFetching,
    isError: searchQuery.isError,
    error: searchQuery.error,
    hasQuery: debouncedQuery.trim().length > 0,
  }
}
