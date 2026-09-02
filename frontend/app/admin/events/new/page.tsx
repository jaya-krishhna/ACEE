'use client';

import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/events/EventForm';

export default function NewEventPage() {
  const router = useRouter();

  const handleSuccess = (event: any) => {
    // Redirect to edit page so they can manage custom fields and banner
    router.push(`/admin/events/${event.id}/edit`);
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-oat">
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-espresso">Create Event</h1>
        <p className="text-sm text-shadow font-sans">
          Fill out the details below to create a new event.
        </p>
      </div>

      <EventForm onSuccess={handleSuccess} />
    </div>
  );
}
