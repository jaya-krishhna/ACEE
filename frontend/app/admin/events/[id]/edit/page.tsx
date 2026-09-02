'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getEventBySlug } from '@/lib/api/events';
import { EventForm } from '@/components/events/EventForm';
import { CustomFieldsManager } from '@/components/events/CustomFieldsManager';
import { BannerUpload } from '@/components/events/BannerUpload';
import { CardSkeleton } from '@/components/ui/Skeleton';

export default function EditEventPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [eventData, setEventData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadEvent() {
      try {
        const data = await getEventBySlug(eventId);
        setEventData(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load event');
      } finally {
        setIsLoading(false);
      }
    }
    loadEvent();
  }, [eventId]);

  const handleSuccess = (updatedEvent: any) => {
    // Event updated
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-6 rounded-[10px] text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-oat">
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-espresso">Edit Event</h1>
        <p className="text-sm text-shadow font-sans">
          Update event details, manage custom fields, and upload a banner.
        </p>
      </div>

      <EventForm initialData={eventData} eventId={eventData.id} onSuccess={handleSuccess} />

      <BannerUpload eventId={eventData.id} currentBannerUrl={eventData.banner_image_url} />

      <CustomFieldsManager eventId={eventData.id} />
    </div>
  );
}
