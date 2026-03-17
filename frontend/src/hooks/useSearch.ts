import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchService } from '../services/search'
import type { SearchFilters, SearchResult } from '../types'

const PAGE_SIZE = 20

interface UseSearchOptions {
  orgSlug: string
  debounceMs?: number
}

export function useSearch({ orgSlug, debounceMs = 300 }: UseSearchOptions) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [page, setPage] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
      setSelectedIndex(-1)
      setPage(1)
    }, debounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, debounceMs])

  const searchQuery = useQuery({
    queryKey: ['search', orgSlug, debouncedQuery, filters, page],
    queryFn: () =>
      searchService.search(orgSlug, debouncedQuery, {
        ...filters,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    enabled: !!orgSlug && debouncedQuery.trim().length > 0,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })

  const navigateResults = useCallback(
    (direction: 'up' | 'down') => {
      const results = searchQuery.data?.results ?? []
      if (results.length === 0) return
      setSelectedIndex((prev) => {
        if (direction === 'down') return prev < results.length - 1 ? prev + 1 : prev
        else return prev > 0 ? prev - 1 : 0
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
      setPage(1)
    },
    []
  )

  const clearFilters = useCallback(() => {
    setFilters({})
    setPage(1)
  }, [])

  const total = searchQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return {
    query,
    setQuery,
    filters,
    updateFilter,
    clearFilters,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    selectedIndex,
    setSelectedIndex,
    navigateResults,
    openSelected,
    results: searchQuery.data?.results ?? [],
    total,
    isLoading: searchQuery.isLoading,
    isFetching: searchQuery.isFetching,
    isError: searchQuery.isError,
    hasQuery: debouncedQuery.trim().length > 0,
  }
}
