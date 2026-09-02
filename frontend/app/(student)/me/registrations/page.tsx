'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useMyRegistrations, useSavedEvents } from '@/lib/queries';
import { EventCard } from '@/components/events/EventCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { CardGridSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

export default function MyRegistrationsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading: isRegistrationsLoading } = useMyRegistrations(page, 12);

  const { data: savedEventsData } = useSavedEvents(1, 100);
  const savedEventIds = new Set<string>((savedEventsData?.data || []).map((e: any) => e.id));

  if (isAuthLoading) {
    return <CardGridSkeleton />;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-ivory border border-oat rounded-[10px] p-8">
          <h1 className="text-2xl font-serif font-bold text-espresso mb-4">Sign in required</h1>
          <p className="text-shadow mb-6">Please sign in to view your event registrations.</p>
          <Button
            onClick={() => router.push('/auth/login?redirect=/me/registrations')}
            className="w-full"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 pb-4 border-b border-oat">
        <h1 className="text-3xl font-serif font-bold text-espresso mb-2">My Registrations</h1>
        <p className="text-shadow font-sans">Events and opportunities you have registered for.</p>
      </div>

      {isRegistrationsLoading ? (
        <CardGridSkeleton />
      ) : data?.data?.length === 0 ? (
        <EmptyState
          title="No registrations yet"
          description="You haven't registered for any events yet. Explore events and sign up!"
          action={<Button onClick={() => router.push('/')}>Explore Events</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {data?.data?.map((registration: any) => (
              <EventCard
                key={registration.id}
                event={registration}
                showRegistrationInfo={true}
                registrationStatus={registration.status}
                paymentStatus={registration.payment_status}
                registeredAt={registration.registered_at}
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
