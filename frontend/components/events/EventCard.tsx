'use client';

import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { MapPin, Globe, Trophy, BookOpen, Briefcase, Sparkles } from 'lucide-react';
import { EventCard as EventCardType } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { SaveButton } from '@/components/events/SaveButton';

interface EventCardProps {
  event: EventCardType;
  showRegistrationInfo?: boolean;
  registrationStatus?: string;
  paymentStatus?: string;
  registeredAt?: string;
  savedEventIds?: Set<string>;
  onSave?: (id: string) => void;
  onUnsave?: (id: string) => void;
  isAuthenticated?: boolean;
}

export function EventCard({
  event,
  showRegistrationInfo,
  registrationStatus,
  paymentStatus,
  registeredAt,
  savedEventIds,
  onSave,
  onUnsave,
  isAuthenticated = false,
}: EventCardProps) {
  const isSaved = savedEventIds?.has(event.id) ?? false;

  const renderBannerPlaceholder = () => {
    switch (event.event_type) {
      case 'hackathon':
        return <Trophy className="w-10 h-10 text-shadow/60" />;
      case 'workshop':
        return <BookOpen className="w-10 h-10 text-shadow/60" />;
      case 'internship':
        return <Briefcase className="w-10 h-10 text-shadow/60" />;
      default:
        return <Sparkles className="w-10 h-10 text-shadow/60" />;
    }
  };

  return (
    <Link href={`/events/${event.slug}`} className="block h-full group">
      <div className="bg-ivory border border-oat rounded-[10px] h-full flex flex-col relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-espresso/30">
        {/* Banner image or icon placeholder */}
        <div className="relative h-40 w-full bg-oat/20 border-b border-oat overflow-hidden">
          {event.banner_image_url ? (
            <Image
              src={event.banner_image_url}
              alt={event.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-oat/20">
              {renderBannerPlaceholder()}
            </div>
          )}
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge
              variant="muted"
              className="capitalize shadow-sm bg-sunlit/90 backdrop-blur-sm border-oat"
            >
              {event.event_type}
            </Badge>
          </div>
          <div className="absolute top-3 right-3 z-10" onClick={(e) => e.preventDefault()}>
            <SaveButton
              eventId={event.id}
              isSaved={isSaved}
              onToggle={() => {
                if (isSaved && onUnsave) onUnsave(event.id);
                else if (!isSaved && onSave) onSave(event.id);
              }}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>

        {/* Card Content */}
        <div className="p-5 flex flex-col flex-grow bg-ivory">
          <div className="text-xs font-semibold text-shadow uppercase tracking-wider mb-1">
            {event.organization.name}
          </div>
          <h3 className="text-lg font-bold font-serif text-espresso mb-2 line-clamp-2 leading-snug">
            {event.title}
          </h3>
          {event.tagline && (
            <p className="text-sm text-shadow mb-3 line-clamp-2 leading-relaxed">{event.tagline}</p>
          )}

          {/* Repositioned Hackathon Prize Summary — full width line beneath title/tagline */}
          {event.event_type === 'hackathon' && event.prize_summary_text && (
            <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-burgundy bg-burgundy/10 border border-burgundy/20 px-2.5 py-1.5 rounded-[6px]">
              <Trophy size={14} className="shrink-0" />
              <span className="line-clamp-1">{event.prize_summary_text}</span>
            </div>
          )}

          <div className="mt-auto space-y-2 pt-2">
            {event.location && (
              <div className="flex items-center text-sm text-shadow gap-2">
                {event.location.toLowerCase().includes('online') ? (
                  <Globe className="w-4 h-4 text-shadow/70 shrink-0" />
                ) : (
                  <MapPin className="w-4 h-4 text-shadow/70 shrink-0" />
                )}
                <span className="truncate">{event.location}</span>
              </div>
            )}

            {event.event_start_at && (
              <div className="text-sm text-shadow">
                <span className="font-medium text-espresso">Starts:</span>{' '}
                {format(new Date(event.event_start_at), 'd MMM yyyy')}
              </div>
            )}

            {event.registration_close_at && (
              <div className="text-sm text-burgundy font-medium">
                Register by {format(new Date(event.registration_close_at), 'd MMM yyyy')}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-oat">
              <span className="font-semibold text-espresso text-base">
                {event.is_paid ? `₹${event.registration_fee}` : 'Free'}
              </span>
            </div>

            {showRegistrationInfo && (
              <div className="pt-3 flex flex-wrap gap-2 border-t border-oat">
                {registrationStatus && (
                  <Badge className="capitalize">Status: {registrationStatus}</Badge>
                )}
                {paymentStatus && <Badge className="capitalize">Payment: {paymentStatus}</Badge>}
                {registeredAt && (
                  <div className="w-full text-xs text-shadow mt-1">
                    Registered on {format(new Date(registeredAt), 'd MMM yyyy')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
