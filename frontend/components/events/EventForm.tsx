'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { createEvent, updateEvent } from '@/lib/api/organizer';
import { useLocations, useTags, useEligibilityCategories } from '@/lib/queries';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { ContactsSection, ContactRow } from '@/components/events/ContactsSection';

export interface EventFormProps {
  initialData?: any;
  eventId?: string;
  onSuccess: (event: any) => void;
}

export function EventForm({ initialData, eventId, onSuccess }: EventFormProps) {
  const isEdit = !!eventId;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: locationsResponse } = useLocations();
  const { data: tagsResponse } = useTags();
  const { data: categoriesResponse } = useEligibilityCategories();

  const locations = locationsResponse || [];
  const tags = tagsResponse || [];
  const categories = categoriesResponse || [];

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: initialData?.title || '',
      event_type: initialData?.event_type || 'hackathon',
      tagline: initialData?.tagline || '',
      description: initialData?.description || '',
      mode: initialData?.mode || 'offline',
      venue: initialData?.venue || '',
      location_id: initialData?.location?.id || '',
      timezone: initialData?.timezone || 'Asia/Kolkata',
      is_paid: initialData?.is_paid || false,
      registration_fee: initialData?.registration_fee || 0,
      currency: initialData?.currency || 'INR',
      resume_required: initialData?.resume_required || false,
      registration_open_at: initialData?.registration_open_at
        ? new Date(initialData.registration_open_at).toISOString().slice(0, 16)
        : '',
      registration_close_at: initialData?.registration_close_at
        ? new Date(initialData.registration_close_at).toISOString().slice(0, 16)
        : '',
      event_start_at: initialData?.event_start_at
        ? new Date(initialData.event_start_at).toISOString().slice(0, 16)
        : '',
      event_end_at: initialData?.event_end_at
        ? new Date(initialData.event_end_at).toISOString().slice(0, 16)
        : '',
      eligibility_notes: initialData?.eligibility_notes || '',
      eligibility_category_ids: initialData?.eligibility_categories?.map((c: any) => c.id) || [],
      tag_ids: initialData?.tags?.map((t: any) => t.id) || [],
      contacts: initialData?.contacts || [],

      // Type specific
      hackathon_details: {
        max_participants: initialData?.hackathon_details?.max_participants || '',
        prize_summary_text: initialData?.hackathon_details?.prize_summary_text || '',
        tracks: initialData?.hackathon_details?.tracks?.join(', ') || '',
        submission_type: initialData?.hackathon_details?.submission_type || 'prototype',
      },
      workshop_details: {
        speaker_name: initialData?.workshop_details?.speaker_name || '',
        speaker_bio: initialData?.workshop_details?.speaker_bio || '',
        duration_hours: initialData?.workshop_details?.duration_hours || '',
        seats_available: initialData?.workshop_details?.seats_available || '',
        certificate_provided: initialData?.workshop_details?.certificate_provided || false,
        prerequisite_skills: initialData?.workshop_details?.prerequisite_skills?.join(', ') || '',
      },
      internship_details: {
        stipend_min: initialData?.internship_details?.stipend_min || '',
        stipend_max: initialData?.internship_details?.stipend_max || '',
        duration_months: initialData?.internship_details?.duration_months || '',
        work_mode: initialData?.internship_details?.work_mode || 'remote',
        positions_available: initialData?.internship_details?.positions_available || '',
        min_experience_months: initialData?.internship_details?.min_experience_months || 0,
        perks: initialData?.internship_details?.perks?.join(', ') || '',
      },
    },
  });

  const eventType = watch('event_type');
  const mode = watch('mode');
  const isPaid = watch('is_paid');

  const onSubmit = async (data: any) => {
    setError('');

    // Validations
    if (
      data.event_start_at &&
      data.event_end_at &&
      new Date(data.event_start_at) >= new Date(data.event_end_at)
    ) {
      setError('Event start time must be before end time');
      return;
    }

    const payload = { ...data };

    // Formatting
    if (mode === 'online') {
      delete payload.venue;
      delete payload.location_id;
    } else {
      payload.location_id = parseInt(payload.location_id, 10);
    }

    payload.registration_fee = parseFloat(payload.registration_fee) || 0;

    // Format arrays and type specific info
    if (eventType === 'hackathon') {
      payload.hackathon_details.max_participants =
        parseInt(payload.hackathon_details.max_participants, 10) || null;
      payload.hackathon_details.tracks = payload.hackathon_details.tracks
        ? payload.hackathon_details.tracks.split(',').map((s: string) => s.trim())
        : [];
      delete payload.workshop_details;
      delete payload.internship_details;
    } else if (eventType === 'workshop') {
      payload.workshop_details.duration_hours =
        parseInt(payload.workshop_details.duration_hours, 10) || null;
      payload.workshop_details.seats_available =
        parseInt(payload.workshop_details.seats_available, 10) || null;
      payload.workshop_details.prerequisite_skills = payload.workshop_details.prerequisite_skills
        ? payload.workshop_details.prerequisite_skills.split(',').map((s: string) => s.trim())
        : [];
      delete payload.hackathon_details;
      delete payload.internship_details;
    } else if (eventType === 'internship') {
      payload.internship_details.stipend_min =
        parseInt(payload.internship_details.stipend_min, 10) || null;
      payload.internship_details.stipend_max =
        parseInt(payload.internship_details.stipend_max, 10) || null;
      payload.internship_details.duration_months =
        parseInt(payload.internship_details.duration_months, 10) || null;
      payload.internship_details.positions_available =
        parseInt(payload.internship_details.positions_available, 10) || null;
      payload.internship_details.min_experience_months =
        parseInt(payload.internship_details.min_experience_months, 10) || 0;
      payload.internship_details.perks = payload.internship_details.perks
        ? payload.internship_details.perks.split(',').map((s: string) => s.trim())
        : [];
      delete payload.hackathon_details;
      delete payload.workshop_details;
    }

    // Convert date strings to proper ISO
    const dateFields = [
      'registration_open_at',
      'registration_close_at',
      'event_start_at',
      'event_end_at',
    ];
    for (const df of dateFields) {
      if (payload[df]) {
        payload[df] = new Date(payload[df]).toISOString();
      } else {
        payload[df] = null;
      }
    }

    setIsLoading(true);
    try {
      let result;
      if (isEdit && eventId) {
        result = await updateEvent(eventId, payload);
        toast.success('Event updated successfully');
      } else {
        result = await createEvent(payload);
        toast.success('Event created successfully');
      }
      onSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Failed to save event');
      toast.error('Error saving event');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 bg-ivory p-6 border border-oat rounded-[10px] shadow-sm"
    >
      {error && (
        <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-4 rounded-[10px] text-sm">
          {error}
        </div>
      )}

      {/* Core section */}
      <div className="space-y-4">
        <h3 className="text-xl font-serif font-bold text-espresso border-b border-oat pb-2">
          Core details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Event title"
            {...register('title', { required: 'Title is required' })}
            error={errors.title?.message as string}
          />

          <Select
            label="Event type"
            {...register('event_type')}
            options={[
              { label: 'Hackathon', value: 'hackathon' },
              { label: 'Workshop', value: 'workshop' },
              { label: 'Internship', value: 'internship' },
            ]}
          />
        </div>

        <Input label="Tagline" {...register('tagline')} />

        <Textarea
          label="Description"
          rows={5}
          {...register('description', { required: 'Description is required' })}
          error={errors.description?.message as string}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Select
            label="Mode"
            {...register('mode')}
            options={[
              { label: 'Online', value: 'online' },
              { label: 'Offline', value: 'offline' },
              { label: 'Hybrid', value: 'hybrid' },
            ]}
          />
          <Input label="Timezone" {...register('timezone')} hint="e.g. Asia/Kolkata" />
        </div>

        {mode !== 'online' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-sunlit rounded-[10px] border border-oat">
            <Input label="Venue" {...register('venue')} />
            <Select
              label="Location"
              {...register('location_id', {
                required: mode !== 'online' ? 'Location is required' : false,
              })}
              error={errors.location_id?.message as string}
              options={[
                { label: 'Select location...', value: '' },
                ...locations.map((l: any) => ({ label: `${l.city}, ${l.country}`, value: l.id })),
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-sunlit rounded-[10px] border border-oat">
          <div className="flex items-center h-full">
            <label className="flex items-center space-x-2 text-sm font-medium text-espresso">
              <input
                type="checkbox"
                className="rounded border-oat text-burgundy focus:ring-burgundy"
                {...register('is_paid')}
              />
              <span>Paid event</span>
            </label>
          </div>
          {isPaid && (
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  label="Fee amount"
                  type="number"
                  step="0.01"
                  {...register('registration_fee')}
                />
              </div>
              <div className="w-24">
                <Input label="Currency" {...register('currency')} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Registration open at"
            type="datetime-local"
            {...register('registration_open_at')}
          />
          <Input
            label="Registration close at"
            type="datetime-local"
            {...register('registration_close_at')}
          />
          <Input
            label="Event start at"
            type="datetime-local"
            {...register('event_start_at', { required: 'Start time is required' })}
            error={errors.event_start_at?.message as string}
          />
          <Input label="Event end at" type="datetime-local" {...register('event_end_at')} />
        </div>
      </div>

      {/* Categories & Tags */}
      <div className="space-y-4">
        <h3 className="text-xl font-serif font-bold text-espresso border-b border-oat pb-2">
          Tags & Eligibility
        </h3>

        <div className="space-y-2">
          <label className="text-sm font-medium text-espresso">Eligibility categories</label>
          <div className="flex flex-wrap gap-4">
            {categories.map((cat: any) => (
              <label key={cat.id} className="flex items-center space-x-2 text-sm text-espresso">
                <input
                  type="checkbox"
                  value={cat.id}
                  {...register('eligibility_category_ids')}
                  className="rounded border-oat text-burgundy focus:ring-burgundy"
                />
                <span>{cat.name}</span>
              </label>
            ))}
          </div>
        </div>

        <Textarea label="Eligibility notes" rows={2} {...register('eligibility_notes')} />

        <div className="space-y-2 mt-4">
          <label className="text-sm font-medium text-espresso">Tags</label>
          <div className="flex flex-wrap gap-4">
            {tags.map((tag: any) => (
              <label key={tag.id} className="flex items-center space-x-2 text-sm text-espresso">
                <input
                  type="checkbox"
                  value={tag.id}
                  {...register('tag_ids')}
                  className="rounded border-oat text-burgundy focus:ring-burgundy"
                />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center space-x-2 text-sm font-medium text-espresso mt-4">
          <input
            type="checkbox"
            className="rounded border-oat text-burgundy focus:ring-burgundy"
            {...register('resume_required')}
          />
          <span>Resume required for registration</span>
        </label>
      </div>

      {/* Type-specific section */}
      <div className="space-y-4">
        <h3 className="text-xl font-serif font-bold text-espresso border-b border-oat pb-2 capitalize">
          {eventType} details
        </h3>

        {eventType === 'hackathon' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Max participants"
              type="number"
              {...register('hackathon_details.max_participants')}
            />
            <Select
              label="Submission type"
              {...register('hackathon_details.submission_type')}
              options={[
                { label: 'Idea', value: 'idea' },
                { label: 'Prototype', value: 'prototype' },
                { label: 'Full build', value: 'full-build' },
                { label: 'GitHub and demo', value: 'github_and_demo' },
              ]}
            />
            <div className="md:col-span-2">
              <Input label="Tracks (comma-separated)" {...register('hackathon_details.tracks')} />
            </div>
            <div className="md:col-span-2">
              <Textarea
                label="Prize summary"
                rows={3}
                {...register('hackathon_details.prize_summary_text')}
              />
            </div>
          </div>
        )}

        {eventType === 'workshop' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input label="Speaker name" {...register('workshop_details.speaker_name')} />
            <Input
              label="Duration (hours)"
              type="number"
              step="0.5"
              {...register('workshop_details.duration_hours')}
            />
            <Input
              label="Seats available"
              type="number"
              {...register('workshop_details.seats_available')}
            />
            <div className="flex items-center mt-6">
              <label className="flex items-center space-x-2 text-sm font-medium text-espresso">
                <input
                  type="checkbox"
                  className="rounded border-oat text-burgundy focus:ring-burgundy"
                  {...register('workshop_details.certificate_provided')}
                />
                <span>Certificate provided</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <Textarea
                label="Speaker bio"
                rows={3}
                {...register('workshop_details.speaker_bio')}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label="Prerequisite skills (comma-separated)"
                {...register('workshop_details.prerequisite_skills')}
              />
            </div>
          </div>
        )}

        {eventType === 'internship' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Minimum stipend"
              type="number"
              {...register('internship_details.stipend_min')}
            />
            <Input
              label="Maximum stipend"
              type="number"
              {...register('internship_details.stipend_max')}
            />
            <Input
              label="Duration (months)"
              type="number"
              {...register('internship_details.duration_months')}
            />
            <Select
              label="Work mode"
              {...register('internship_details.work_mode')}
              options={[
                { label: 'Remote', value: 'remote' },
                { label: 'Onsite', value: 'onsite' },
                { label: 'Hybrid', value: 'hybrid' },
              ]}
            />
            <Input
              label="Positions available"
              type="number"
              {...register('internship_details.positions_available')}
            />
            <Input
              label="Min experience (months)"
              type="number"
              {...register('internship_details.min_experience_months')}
            />
            <div className="md:col-span-2">
              <Input label="Perks (comma-separated)" {...register('internship_details.perks')} />
            </div>
          </div>
        )}
      </div>

      {/* Contacts section */}
      <div className="pt-4 border-t border-oat">
        <Controller
          name="contacts"
          control={control}
          render={({ field }) => (
            <ContactsSection contacts={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="pt-6 flex justify-end gap-4 border-t border-oat">
        <Button type="submit" isLoading={isLoading}>
          {isEdit ? 'Save changes' : 'Create event'}
        </Button>
      </div>
    </form>
  );
}
