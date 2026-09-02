'use client';

import React from 'react';
import { SearchStatus } from '@/lib/hooks/useSearch';
import { SearchResultItem } from '@/lib/api/search';
import { EventCard } from '@/components/events/EventCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sparkles, RefreshCw, FilterX } from 'lucide-react';

export interface SearchResultsProps {
  status: SearchStatus;
  results: SearchResultItem[];
  total: number;
  rawQuery: string;
  queryInterpreted: string | null;
  error: string | null;
  isLiteralMode: boolean;
  onSearchLiteral: () => void;
  onRetry: () => void;
  onResetFilters?: () => void;
  savedEventIds?: Set<string>;
  isAuthenticated?: boolean;
}

export function SearchResults({
  status,
  results,
  total,
  rawQuery,
  queryInterpreted,
  error,
  isLiteralMode,
  onSearchLiteral,
  onRetry,
  onResetFilters,
  savedEventIds,
  isAuthenticated = false,
}: SearchResultsProps) {
  if (status === 'idle') {
    return null;
  }

  return (
    <div className="space-y-6" aria-live="polite">
      {/* Screen reader announcement */}
      <span className="sr-only">
        {status === 'loading'
          ? 'Searching for matching events...'
          : status === 'empty'
            ? `No events matched ${rawQuery}`
            : status === 'error'
              ? 'Search is temporarily unavailable'
              : `Found ${total} matching events`}
      </span>

      {/* AI Query Interpretation Feedback Banner */}
      {status === 'success' && queryInterpreted && !isLiteralMode && (
        <div className="bg-ivory border border-oat rounded-[10px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-espresso">
            <Sparkles className="w-4 h-4 text-burgundy shrink-0" />
            <span>
              Showing results for: <strong className="font-semibold">{queryInterpreted}</strong>
            </span>
          </div>
          {rawQuery && (
            <button
              onClick={onSearchLiteral}
              className="text-xs text-burgundy hover:underline font-medium shrink-0"
            >
              Search instead for &quot;{rawQuery}&quot;
            </button>
          )}
        </div>
      )}

      {/* Literal search mode active badge */}
      {status === 'success' && isLiteralMode && rawQuery && (
        <div className="bg-ivory border border-oat rounded-[10px] p-3 text-xs text-shadow flex items-center justify-between">
          <span>Literal keyword search for: &quot;{rawQuery}&quot;</span>
        </div>
      )}

      {/* Loading State: 3-4 skeleton cards, don't show old results dimmed underneath */}
      {status === 'loading' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {/* Error State: User friendly error message + Retry button */}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 bg-ivory border border-oat rounded-[10px] p-8">
          <div className="w-12 h-12 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center border border-burgundy/20">
            <RefreshCw size={24} />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-espresso">
              Search is temporarily unavailable
            </h3>
            <p className="text-sm text-shadow mt-1 max-w-sm mx-auto">
              {error || 'We encountered a problem connecting to the search service.'}
            </p>
          </div>
          <Button onClick={onRetry} variant="primary">
            <RefreshCw size={16} className="mr-2" />
            Try again
          </Button>
        </div>
      )}

      {/* Empty State: Not a dead end, suggests broadening filters */}
      {status === 'empty' && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 bg-ivory border border-oat rounded-[10px] p-8">
          <div className="w-12 h-12 rounded-full bg-oat/30 text-espresso flex items-center justify-center border border-oat">
            <FilterX size={24} />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-espresso">
              No events matched &quot;{rawQuery}&quot;
            </h3>
            <p className="text-sm text-shadow mt-1 max-w-sm mx-auto">
              Try adjusting your search terms, searching for broader keywords, or clearing active
              location/category filters.
            </p>
          </div>
          {onResetFilters && (
            <Button onClick={onResetFilters} variant="secondary">
              Reset search & filters
            </Button>
          )}
        </div>
      )}

      {/* Results State */}
      {status === 'success' && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              savedEventIds={savedEventIds}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
