'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { useUploadBanner } from '@/lib/queries';
import { Button } from '@/components/ui/Button';

interface BannerUploadProps {
  eventId: string;
  currentBannerUrl: string | null;
}

export function BannerUpload({ eventId, currentBannerUrl }: BannerUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentBannerUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadBanner();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      toast.error('Please select a JPEG, PNG, or WebP image');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setFile(selected);
    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      await uploadMutation.mutateAsync({ id: eventId, file });
      toast.success('Banner uploaded successfully');
      setFile(null); // Reset file selection after successful upload
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload banner');
    }
  };

  return (
    <div className="bg-ivory border border-oat rounded-[10px] p-6 shadow-sm mt-8 space-y-6">
      <div>
        <h3 className="text-xl font-serif font-bold text-espresso">Event Banner</h3>
        <p className="text-sm text-shadow font-sans">
          Upload a high-quality banner image for your event. Recommended size: 1200x630.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {previewUrl ? (
          <div className="relative w-full aspect-[21/9] bg-oat/20 rounded-[10px] overflow-hidden border border-oat">
            <Image src={previewUrl} alt="Event banner preview" fill className="object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-[21/9] bg-oat/20 rounded-[10px] flex items-center justify-center border border-oat border-dashed">
            <span className="text-shadow">No banner uploaded</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Choose image
          </Button>

          {file && (
            <Button
              type="button"
              variant="primary"
              onClick={handleUpload}
              isLoading={uploadMutation.isPending}
            >
              Upload banner
            </Button>
          )}
        </div>
        {file && <p className="text-sm text-shadow">Selected file: {file.name}</p>}
      </div>
    </div>
  );
}
