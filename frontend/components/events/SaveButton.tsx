'use client';

import { Heart } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSaveEvent, useUnsaveEvent } from '@/lib/queries';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SaveButtonProps {
  eventId: string;
  isSaved: boolean;
  onToggle?: () => void;
  isAuthenticated?: boolean;
}

export function SaveButton({
  eventId,
  isSaved: initialIsSaved,
  onToggle,
  isAuthenticated = false,
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const saveEvent = useSaveEvent();
  const unsaveEvent = useUnsaveEvent();
  const router = useRouter();

  const handleToggle = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to save events');
      router.push('/auth/login');
      return;
    }

    // Optimistic update
    const previousState = isSaved;
    setIsSaved(!isSaved);
    if (onToggle) onToggle();

    try {
      if (previousState) {
        await unsaveEvent.mutateAsync(eventId);
        toast.success('Event removed from saved');
      } else {
        await saveEvent.mutateAsync(eventId);
        toast.success('Event saved');
      }
    } catch (error) {
      // Revert on error
      setIsSaved(previousState);
      if (onToggle) onToggle();
      toast.error('Failed to update saved status');
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`p-2 rounded-full backdrop-blur-sm transition-colors duration-200 shadow-sm ${
        isSaved
          ? 'bg-burgundy text-sunlit hover:bg-burgundy/90'
          : 'bg-sunlit/90 text-espresso/60 hover:text-burgundy hover:bg-sunlit border border-oat'
      }`}
      aria-label={isSaved ? 'Unsave event' : 'Save event'}
    >
      <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
    </button>
  );
}
