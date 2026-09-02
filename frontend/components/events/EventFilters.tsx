'use client';

import { useLocations, useTags } from '@/lib/queries';
import { Select } from '@/components/ui/Select';
import { X } from 'lucide-react';

export interface FilterValues {
  event_type?: 'hackathon' | 'workshop' | 'internship';
  city_id?: number;
  mode?: 'online' | 'offline' | 'hybrid';
  is_paid?: boolean;
  fee_max?: number;
  date_from?: string;
  date_to?: string;
  tag_ids?: number[];
  sort?: 'newest';
}

interface EventFiltersProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onReset: () => void;
}

export function EventFilters({ values, onChange, onReset }: EventFiltersProps) {
  const { data: locationsData } = useLocations();
  const { data: tagsData } = useTags();

  const locations = locationsData || [];
  const tags = tagsData || [];

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'hackathon' | 'workshop' | 'internship' | '';
    onChange({ ...values, event_type: val || undefined });
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...values, city_id: e.target.value ? Number(e.target.value) : undefined });
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'online' | 'offline' | 'hybrid' | '';
    onChange({ ...values, mode: val || undefined });
  };

  const handlePaidChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    let is_paid: boolean | undefined = undefined;
    if (e.target.value === 'true') is_paid = true;
    if (e.target.value === 'false') is_paid = false;
    onChange({ ...values, is_paid });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'newest' | '';
    onChange({ ...values, sort: val || undefined });
  };

  const toggleTag = (tagId: number) => {
    const currentTags = values.tag_ids || [];
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId];
    onChange({ ...values, tag_ids: newTags.length > 0 ? newTags : undefined });
  };

  return (
    <div className="bg-ivory border border-oat rounded-[10px] p-4 mb-8 space-y-4 shadow-sm">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[150px]">
          <Select label="Event type" value={values.event_type || ''} onChange={handleTypeChange}>
            <option value="">All types</option>
            <option value="hackathon">Hackathon</option>
            <option value="workshop">Workshop</option>
            <option value="internship">Internship</option>
          </Select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <Select
            label="Location"
            value={values.city_id?.toString() || ''}
            onChange={handleCityChange}
          >
            <option value="">All locations</option>
            {locations.map((loc: any) => (
              <option key={loc.id} value={loc.id}>
                {loc.city}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <Select label="Mode" value={values.mode || ''} onChange={handleModeChange}>
            <option value="">All modes</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <Select
            label="Price"
            value={values.is_paid === true ? 'true' : values.is_paid === false ? 'false' : ''}
            onChange={handlePaidChange}
          >
            <option value="">All prices</option>
            <option value="false">Free</option>
            <option value="true">Paid</option>
          </Select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <Select label="Sort by" value={values.sort || ''} onChange={handleSortChange}>
            <option value="">Start date (earliest)</option>
            <option value="newest">Newest</option>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-oat">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <span className="text-sm font-medium text-shadow mr-2">Tags:</span>
          {tags.slice(0, 15).map((tag: any) => {
            const isSelected = values.tag_ids?.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`px-3 py-1 text-xs rounded-full transition-colors border font-medium ${
                  isSelected
                    ? 'bg-burgundy text-sunlit border-burgundy'
                    : 'bg-sunlit text-espresso border-oat hover:border-espresso/40'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>

        <button
          onClick={onReset}
          className="text-sm text-burgundy hover:opacity-80 font-medium flex items-center gap-1 transition-colors"
        >
          <X className="w-4 h-4" />
          Reset filters
        </button>
      </div>
    </div>
  );
}
