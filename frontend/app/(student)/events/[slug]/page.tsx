'use client';

import { useEventDetail, useMyRegistrations, useSavedEvents, useCustomFields } from '@/lib/queries';
import { useAuth } from '@/lib/auth/context';
import Image from 'next/image';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  MapPin,
  Globe,
  Calendar,
  Clock,
  Building2,
  User,
  Trophy,
  BookOpen,
  ExternalLink,
  Briefcase,
  Sparkles,
} from 'lucide-react';
import { RegisterButton } from '@/components/events/RegisterButton';
import { SaveButton } from '@/components/events/SaveButton';

export default function EventDetailPage({ params }: { params: { slug: string } }) {
  const { user } = useAuth();
  const { data: event, isLoading, isError } = useEventDetail(params.slug);

  const { data: registrations } = useMyRegistrations(1, 100);
  const isRegistered = registrations?.data?.some(
    (r: any) => r.id === event?.id || r.slug === event?.slug,
  );

  const { data: savedEvents } = useSavedEvents(1, 100);
  const isSaved = savedEvents?.data?.some((e: any) => e.id === event?.id);

  const { data: customFields = [] } = useCustomFields(event?.id ?? '');

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse">
        <Skeleton className="w-full h-[400px] rounded-[10px] mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full mt-8" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-bold font-serif text-espresso mb-4">Event not found</h1>
        <p className="text-shadow mb-8">
          The event you are looking for does not exist or has been removed.
        </p>
        <a href="/" className="text-burgundy hover:underline font-medium">
          Browse all events
        </a>
      </div>
    );
  }

  const renderBannerPlaceholder = () => {
    switch (event.event_type) {
      case 'hackathon':
        return <Trophy className="w-16 h-16 text-shadow/60" />;
      case 'workshop':
        return <BookOpen className="w-16 h-16 text-shadow/60" />;
      case 'internship':
        return <Briefcase className="w-16 h-16 text-shadow/60" />;
      default:
        return <Sparkles className="w-16 h-16 text-shadow/60" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Banner */}
      <div className="w-full h-[300px] md:h-[400px] rounded-[10px] overflow-hidden mb-8 relative bg-oat/20 border border-oat">
        {event.banner_image_url ? (
          <Image
            src={event.banner_image_url}
            alt={event.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-oat/20">
            {renderBannerPlaceholder()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Badge
                variant="muted"
                className="capitalize bg-burgundy/10 text-burgundy border-burgundy/20 px-3 py-1 text-sm font-medium"
              >
                {event.event_type}
              </Badge>
              {event.mode === 'online' && (
                <Badge className="bg-sunlit border-oat text-espresso flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Online
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-espresso mb-3">
              {event.title}
            </h1>
            {event.tagline && <p className="text-xl text-shadow font-medium">{event.tagline}</p>}
          </div>

          <div className="prose prose-lg max-w-none">
            <h2 className="text-2xl font-serif font-bold text-espresso mb-4">About this event</h2>
            <div className="whitespace-pre-wrap leading-relaxed text-espresso">
              {event.description}
            </div>
          </div>

          {/* Type specific details */}
          {event.event_type === 'hackathon' && event.hackathon_details && (
            <div className="bg-ivory rounded-[10px] border border-oat p-6">
              <h2 className="text-xl font-serif font-bold text-espresso mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-burgundy" />
                Hackathon Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {event.hackathon_details.prize_summary_text && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Prizes</h3>
                    <p className="text-espresso font-semibold text-burgundy">
                      {event.hackathon_details.prize_summary_text}
                    </p>
                  </div>
                )}
                {event.hackathon_details.max_participants && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Max Participants</h3>
                    <p className="text-espresso font-medium">
                      {event.hackathon_details.max_participants}
                    </p>
                  </div>
                )}
                {event.hackathon_details.submission_type && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Submission</h3>
                    <p className="text-espresso font-medium capitalize">
                      {event.hackathon_details.submission_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
                {event.hackathon_details.tracks && event.hackathon_details.tracks.length > 0 && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-medium text-shadow mb-2">Tracks</h3>
                    <div className="flex flex-wrap gap-2">
                      {event.hackathon_details.tracks.map((track: string, i: number) => (
                        <Badge key={i} className="bg-sunlit border-oat text-espresso">
                          {track}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {event.event_type === 'workshop' && event.workshop_details && (
            <div className="bg-ivory rounded-[10px] border border-oat p-6">
              <h2 className="text-xl font-serif font-bold text-espresso mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-burgundy" />
                Workshop Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {event.workshop_details.speaker_name && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-medium text-shadow mb-1">Speaker</h3>
                    <p className="text-espresso font-medium">
                      {event.workshop_details.speaker_name}
                    </p>
                    {event.workshop_details.speaker_bio && (
                      <p className="text-sm text-shadow mt-1">
                        {event.workshop_details.speaker_bio}
                      </p>
                    )}
                  </div>
                )}
                {event.workshop_details.duration_hours && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Duration</h3>
                    <p className="text-espresso font-medium">
                      {event.workshop_details.duration_hours} hours
                    </p>
                  </div>
                )}
                {event.workshop_details.seats_available && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Seats</h3>
                    <p className="text-espresso font-medium">
                      {event.workshop_details.seats_available}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {event.event_type === 'internship' && event.internship_details && (
            <div className="bg-ivory rounded-[10px] border border-oat p-6">
              <h2 className="text-xl font-serif font-bold text-espresso mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-burgundy" />
                Internship Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-shadow mb-1">Stipend</h3>
                  <p className="text-espresso font-medium">
                    {event.internship_details.stipend_min && event.internship_details.stipend_max
                      ? `₹${event.internship_details.stipend_min} - ₹${event.internship_details.stipend_max}`
                      : event.internship_details.stipend_min
                        ? `₹${event.internship_details.stipend_min}`
                        : 'Unpaid / Not disclosed'}
                  </p>
                </div>
                {event.internship_details.duration_months && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Duration</h3>
                    <p className="text-espresso font-medium">
                      {event.internship_details.duration_months} months
                    </p>
                  </div>
                )}
                {event.internship_details.work_mode && (
                  <div>
                    <h3 className="text-sm font-medium text-shadow mb-1">Work Mode</h3>
                    <p className="text-espresso font-medium capitalize">
                      {event.internship_details.work_mode}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(event.eligibility_notes ||
            (event.eligibility_categories && event.eligibility_categories.length > 0)) && (
            <div>
              <h2 className="text-2xl font-serif font-bold text-espresso mb-4">Eligibility</h2>
              {event.eligibility_notes && (
                <p className="text-espresso mb-4">{event.eligibility_notes}</p>
              )}
              {event.eligibility_categories && event.eligibility_categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {event.eligibility_categories.map((cat: any) => (
                    <Badge key={cat.id} className="bg-sunlit border-oat text-espresso">
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {event.tags && event.tags.length > 0 && (
            <div>
              <h2 className="text-2xl font-serif font-bold text-espresso mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag: any) => (
                  <Badge key={tag.id} className="bg-sunlit border-oat text-espresso">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {event.contacts && event.contacts.length > 0 && (
            <div>
              <h2 className="text-2xl font-serif font-bold text-espresso mb-4">Contact</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {event.contacts.map((contact: any, i: number) => (
                  <div
                    key={i}
                    className="bg-ivory border border-oat rounded-[10px] p-4 flex items-start gap-3"
                  >
                    <div className="p-2 bg-sunlit rounded-full border border-oat">
                      <User className="w-5 h-5 text-shadow" />
                    </div>
                    <div>
                      <p className="font-medium text-espresso">{contact.name}</p>
                      {contact.role && <p className="text-sm text-shadow mb-1">{contact.role}</p>}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-sm text-burgundy hover:underline block"
                        >
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-sm text-espresso hover:underline block"
                        >
                          {contact.phone}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Sticky Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            {/* Registration Card */}
            <div className="bg-ivory border border-oat rounded-[10px] p-6 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-sm font-medium text-shadow mb-1">Registration Fee</div>
                  <div className="text-3xl font-bold font-serif text-espresso flex items-center gap-2">
                    {event.is_paid ? (
                      <>
                        <span>₹{event.registration_fee}</span>
                        <span className="text-base font-normal text-shadow font-sans">
                          {event.currency || 'INR'}
                        </span>
                      </>
                    ) : (
                      'Free'
                    )}
                  </div>
                </div>
                <SaveButton
                  eventId={event.id}
                  isSaved={isSaved || false}
                  isAuthenticated={!!user}
                />
              </div>

              <div className="space-y-4 mb-6">
                {event.registration_open_at && (
                  <div className="flex gap-3 text-sm">
                    <Calendar className="w-5 h-5 text-shadow shrink-0" />
                    <div>
                      <p className="font-medium text-espresso">Registration opens</p>
                      <p className="text-shadow">
                        {format(new Date(event.registration_open_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                )}
                {event.registration_close_at && (
                  <div className="flex gap-3 text-sm">
                    <Clock className="w-5 h-5 text-shadow shrink-0" />
                    <div>
                      <p className="font-medium text-espresso">Registration closes</p>
                      <p className="text-burgundy font-medium">
                        {format(new Date(event.registration_close_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                )}

                {event.event_start_at && (
                  <div className="flex gap-3 text-sm pt-4 border-t border-oat">
                    <Calendar className="w-5 h-5 text-burgundy shrink-0" />
                    <div>
                      <p className="font-medium text-espresso">Event starts</p>
                      <p className="text-shadow">
                        {format(new Date(event.event_start_at), 'MMM d, yyyy h:mm a')}
                        {event.event_end_at &&
                          ` - ${format(new Date(event.event_end_at), 'MMM d, yyyy h:mm a')}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Location */}
                <div className="flex gap-3 text-sm pt-4 border-t border-oat">
                  {event.mode === 'online' ? (
                    <Globe className="w-5 h-5 text-shadow shrink-0" />
                  ) : (
                    <MapPin className="w-5 h-5 text-shadow shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-espresso">Location</p>
                    {event.mode === 'online' ? (
                      <p className="text-shadow">Online Event</p>
                    ) : (
                      <>
                        {event.venue && <p className="text-espresso font-medium">{event.venue}</p>}
                        {event.location && typeof event.location === 'object' && (
                          <p className="text-shadow">
                            {[event.location.city, event.location.state, event.location.country]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <RegisterButton
                event={event}
                customFields={customFields}
                isRegistered={!!isRegistered}
              />
            </div>

            {/* Organization Card */}
            <div className="bg-ivory border border-oat rounded-[10px] p-6">
              <h3 className="text-xs font-semibold text-shadow mb-4 uppercase tracking-wider">
                Organized By
              </h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-sunlit border border-oat flex items-center justify-center overflow-hidden shrink-0">
                  {event.organization?.logo_url ? (
                    <Image
                      src={event.organization.logo_url}
                      alt={event.organization.name}
                      width={48}
                      height={48}
                      className="object-cover"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 text-shadow" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold font-serif text-espresso">{event.organization?.name}</p>
                    {event.organization?.is_verified && (
                      <Badge className="bg-burgundy/10 text-burgundy border-burgundy/20 px-1.5 py-0 text-[10px]">
                        Verified
                      </Badge>
                    )}
                  </div>
                  {event.organization?.org_type && (
                    <p className="text-xs text-shadow capitalize">{event.organization.org_type}</p>
                  )}
                </div>
              </div>
              {event.organization?.website_url && (
                <a
                  href={event.organization.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-burgundy hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visit website
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
