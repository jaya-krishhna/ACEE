'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useSavedEvents } from '@/lib/queries';
import { EventCard } from '@/components/events/EventCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { CardGridSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

export default function SavedEventsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading: isEventsLoading } = useSavedEvents(page, 12);

  if (isAuthLoading) {
    return <CardGridSkeleton />;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-ivory border border-oat rounded-[10px] p-8">
          <h1 className="text-2xl font-serif font-bold text-espresso mb-4">Sign in required</h1>
          <p className="text-shadow mb-6">Please sign in to view your saved events.</p>
          <Button onClick={() => router.push('/auth/login?redirect=/saved')} className="w-full">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const savedEventIds = new Set<string>((data?.data || []).map((e: any) => e.id));

  return (
    <div>
      <div className="mb-8 pb-4 border-b border-oat">
        <h1 className="text-3xl font-serif font-bold text-espresso mb-2">Saved Events</h1>
        <p className="text-shadow font-sans">Events you've marked to keep an eye on.</p>
      </div>

      {isEventsLoading ? (
        <CardGridSkeleton />
      ) : data?.data?.length === 0 ? (
        <EmptyState
          title="No saved events yet"
          description="Browse events and click the heart icon to save them for later."
          action={<Button onClick={() => router.push('/')}>Browse Events</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {data?.data?.map((event: any) => (
              <EventCard
                key={event.id}
                event={event}
                savedEventIds={savedEventIds}
                isAuthenticated={true}
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
