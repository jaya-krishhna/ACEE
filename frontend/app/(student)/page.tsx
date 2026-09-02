'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventFilters, FilterValues } from '@/components/events/EventFilters';
import { EventCard } from '@/components/events/EventCard';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResults } from '@/components/search/SearchResults';
import { useEvents, useSavedEvents } from '@/lib/queries';
import { useAuth } from '@/lib/auth/context';
import { useSearch } from '@/lib/hooks/useSearch';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="card h-[380px] flex flex-col overflow-hidden">
          <Skeleton className="h-40 w-full rounded-none" />
          <div className="p-5 flex flex-col flex-grow space-y-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-auto space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/2" />
              <div className="pt-3 mt-3 border-t border-charcoal/10">
                <Skeleton className="h-5 w-1/4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterValues>({});

  // Search hook initialization
  const searchHook = useSearch();
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    setFilters: setSearchFilters,
    status: searchStatus,
    results: searchResults,
    total: searchTotal,
    queryInterpreted,
    rawQuery,
    error: searchError,
    isLiteralMode,
    searchLiteral,
    retry: retrySearch,
    clearSearch,
    executeSearchImmediately,
  } = searchHook;

  // Initialize filters from URL on mount
  useEffect(() => {
    const newFilters: FilterValues = {};
    const type = searchParams.get('event_type');
    if (type) newFilters.event_type = type as any;

    const city = searchParams.get('city_id');
    if (city) newFilters.city_id = Number(city);

    const mode = searchParams.get('mode');
    if (mode) newFilters.mode = mode as any;

    const paid = searchParams.get('is_paid');
    if (paid === 'true') newFilters.is_paid = true;
    if (paid === 'false') newFilters.is_paid = false;

    const sort = searchParams.get('sort');
    if (sort) newFilters.sort = sort as any;

    const tags = searchParams.getAll('tag_ids');
    if (tags.length > 0) newFilters.tag_ids = tags.map(Number);

    const p = searchParams.get('page');
    if (p) setPage(Number(p));

    const q = searchParams.get('q');
    if (q) {
      setSearchQuery(q);
      executeSearchImmediately(q, {
        category: newFilters.event_type ? [newFilters.event_type] : undefined,
        payment:
          newFilters.is_paid === true ? 'paid' : newFilters.is_paid === false ? 'free' : null,
      });
    }

    setFilters(newFilters);
  }, [searchParams, setSearchQuery, executeSearchImmediately]);

  const updateUrlParams = (newFilters: FilterValues, newPage: number, q?: string) => {
    const params = new URLSearchParams();

    if (newFilters.event_type) params.set('event_type', newFilters.event_type);
    if (newFilters.city_id) params.set('city_id', newFilters.city_id.toString());
    if (newFilters.mode) params.set('mode', newFilters.mode);
    if (newFilters.is_paid !== undefined) params.set('is_paid', newFilters.is_paid.toString());
    if (newFilters.sort) params.set('sort', newFilters.sort);

    if (newFilters.tag_ids) {
      newFilters.tag_ids.forEach((id) => params.append('tag_ids', id.toString()));
    }

    if (newPage > 1) params.set('page', newPage.toString());
    if (q) params.set('q', q);

    router.push(`/?${params.toString()}`);
  };

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
    updateUrlParams(newFilters, 1, searchQuery);

    // Sync filters with hybrid search hook
    setSearchFilters({
      category: newFilters.event_type ? [newFilters.event_type] : undefined,
      payment: newFilters.is_paid === true ? 'paid' : newFilters.is_paid === false ? 'free' : null,
    });
  };

  const handleResetFilters = () => {
    setFilters({});
    setPage(1);
    clearSearch();
    router.push('/');
  };

  const { data, isLoading, isError } = useEvents({
    page,
    limit: 12,
    ...filters,
  });

  const { data: savedEventsData } = useSavedEvents(1, 100);
  const savedEventIds = new Set((savedEventsData?.data || []).map((e: any) => e.id));

  const isSearching = searchStatus !== 'idle';

  return (
    <div>
      {/* Hero Section — Section 4 Headline */}
      <div className="mb-8 pb-6 border-b border-oat">
        <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight bg-gradient-to-r from-espresso via-espresso to-burgundy bg-clip-text text-transparent mb-3 leading-tight">
          Where ambition finds its next stage
        </h1>
        <p className="text-base md:text-lg text-shadow font-sans mb-6">
          Discover and register for the best tech events, hackathons, and opportunities.
        </p>

        {/* Search Bar Component */}
        <SearchBar
          value={searchQuery}
          onChange={(val) => {
            setSearchQuery(val);
            if (val) updateUrlParams(filters, 1, val);
          }}
          onSubmit={(val) => {
            executeSearchImmediately(val);
            if (val) updateUrlParams(filters, 1, val);
          }}
          onClear={() => {
            clearSearch();
            updateUrlParams(filters, 1);
          }}
          isLoading={searchStatus === 'loading'}
        />
      </div>

      <EventFilters values={filters} onChange={handleFilterChange} onReset={handleResetFilters} />

      {/* Render Search Results grid when active, otherwise standard events grid */}
      {isSearching ? (
        <SearchResults
          status={searchStatus}
          results={searchResults}
          total={searchTotal}
          rawQuery={rawQuery}
          queryInterpreted={queryInterpreted}
          error={searchError}
          isLiteralMode={isLiteralMode}
          onSearchLiteral={searchLiteral}
          onRetry={retrySearch}
          onResetFilters={handleResetFilters}
          savedEventIds={savedEventIds}
          isAuthenticated={!!user}
        />
      ) : isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <div className="text-center py-12 text-burgundy font-medium">
          Failed to load events. Please try again later.
        </div>
      ) : data?.data?.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Try adjusting your filters to find more events."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {data?.data?.map((event: any) => (
              <EventCard
                key={event.id}
                event={event}
                savedEventIds={savedEventIds}
                isAuthenticated={!!user}
              />
            ))}
          </div>

          {data && data.totalPages > 1 && (
            <div className="mt-12">
              <Pagination
                page={page}
                totalPages={data.totalPages}
                onPageChange={(p) => {
                  setPage(p);
                  updateUrlParams(filters, p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}
