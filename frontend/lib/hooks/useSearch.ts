'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchEvents, SearchFilters, SearchResultItem } from '@/lib/api/search';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UseSearchOptions {
  debounceMs?: number;
  initialQuery?: string;
  initialFilters?: SearchFilters;
  limit?: number;
}

export interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters | ((prev: SearchFilters) => SearchFilters)) => void;
  status: SearchStatus;
  results: SearchResultItem[];
  total: number;
  queryInterpreted: string | null;
  rawQuery: string;
  error: string | null;
  isLiteralMode: boolean;
  searchLiteral: () => void;
  retry: () => void;
  clearSearch: () => void;
  executeSearchImmediately: (q?: string, f?: SearchFilters, isLiteral?: boolean) => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { debounceMs = 400, initialQuery = '', initialFilters = {}, limit = 20 } = options;

  const [query, setQueryState] = useState(initialQuery);
  const [filters, setFiltersState] = useState<SearchFilters>(initialFilters);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [queryInterpreted, setQueryInterpreted] = useState<string | null>(null);
  const [rawQuery, setRawQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLiteralMode, setIsLiteralMode] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform actual search API request
  const performSearch = useCallback(
    async (q: string, f: SearchFilters, literalMode = false) => {
      const trimmedQuery = q.trim();
      const hasFilters =
        (f.category && f.category.length > 0) ||
        f.payment ||
        f.location ||
        (f.tags && f.tags.length > 0) ||
        f.team_size;

      // Idle state if query is empty and no active filters
      if (!trimmedQuery && !hasFilters) {
        setStatus('idle');
        setResults([]);
        setTotal(0);
        setQueryInterpreted(null);
        setError(null);
        return;
      }

      // Abort any existing in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('loading');
      setError(null);
      setRawQuery(trimmedQuery);

      try {
        const response = await searchEvents(
          {
            query: trimmedQuery,
            filters: f,
            limit,
            literalQuery: literalMode,
          },
          { signal: controller.signal },
        );

        // Ignore response if this request was aborted
        if (controller.signal.aborted) return;

        setResults(response.results);
        setTotal(response.total);
        setQueryInterpreted(literalMode ? null : response.query_interpreted);
        setStatus(response.results.length === 0 ? 'empty' : 'success');
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          // Request was cancelled, do not update error state
          return;
        }
        setError('Search is temporarily unavailable');
        setStatus('error');
        setResults([]);
        setTotal(0);
      }
    },
    [limit],
  );

  // Debounced input change
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      setIsLiteralMode(false);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        performSearch(newQuery, filters, false);
      }, debounceMs);
    },
    [debounceMs, filters, performSearch],
  );

  // Immediate filter change trigger
  const setFilters = useCallback(
    (update: SearchFilters | ((prev: SearchFilters) => SearchFilters)) => {
      setFiltersState((prev) => {
        const nextFilters = typeof update === 'function' ? update(prev) : update;
        // Trigger search immediately for filter clicks (no debounce)
        performSearch(query, nextFilters, isLiteralMode);
        return nextFilters;
      });
    },
    [query, isLiteralMode, performSearch],
  );

  // Execute literal search fallback
  const searchLiteral = useCallback(() => {
    setIsLiteralMode(true);
    performSearch(query, filters, true);
  }, [query, filters, performSearch]);

  // Retry failed search
  const retry = useCallback(() => {
    performSearch(query, filters, isLiteralMode);
  }, [query, filters, isLiteralMode, performSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setQueryState('');
    setStatus('idle');
    setResults([]);
    setTotal(0);
    setQueryInterpreted(null);
    setError(null);
    setIsLiteralMode(false);
  }, []);

  const executeSearchImmediately = useCallback(
    (q?: string, f?: SearchFilters, isLiteral?: boolean) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const targetQuery = q !== undefined ? q : query;
      const targetFilters = f !== undefined ? f : filters;
      const targetLiteral = isLiteral !== undefined ? isLiteral : isLiteralMode;
      performSearch(targetQuery, targetFilters, targetLiteral);
    },
    [query, filters, isLiteralMode, performSearch],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    status,
    results,
    total,
    queryInterpreted,
    rawQuery,
    error,
    isLiteralMode,
    searchLiteral,
    retry,
    clearSearch,
    executeSearchImmediately,
  };
}
