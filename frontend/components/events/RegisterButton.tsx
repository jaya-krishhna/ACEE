'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CustomFieldForm } from './CustomFieldForm';
import { useAuth } from '@/lib/auth/context';
import { useRegisterForEvent, useCancelRegistration } from '@/lib/queries';
import { toast } from 'react-hot-toast';

interface RegisterButtonProps {
  event: any;
  customFields?: any[];
  isRegistered?: boolean;
}

export function RegisterButton({
  event,
  customFields = [],
  isRegistered = false,
}: RegisterButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const registerMutation = useRegisterForEvent();
  const cancelMutation = useCancelRegistration();

  const now = new Date();
  const openAt = event.registration_open_at ? new Date(event.registration_open_at) : null;
  const closeAt = event.registration_close_at ? new Date(event.registration_close_at) : null;

  const isWindowClosed = closeAt && now > closeAt;
  const isWindowNotStarted = openAt && now < openAt;

  if (!user) {
    return (
      <Button
        className="w-full"
        onClick={() => router.push(`/auth/login?redirect=/events/${event.slug}`)}
      >
        Sign in to register
      </Button>
    );
  }

  if (isRegistered) {
    return (
      <div className="space-y-3">
        <Button className="w-full bg-ivory text-espresso border border-oat" disabled>
          Registered
        </Button>
        <button
          onClick={async () => {
            if (confirm('Are you sure you want to cancel your registration?')) {
              try {
                await cancelMutation.mutateAsync(event.id);
                toast.success('Registration cancelled');
              } catch (error) {
                toast.error('Failed to cancel registration');
              }
            }
          }}
          className="text-sm text-burgundy hover:underline w-full text-center block"
        >
          Cancel registration
        </button>
      </div>
    );
  }

  if (isWindowNotStarted) {
    return (
      <Button className="w-full bg-ivory text-shadow border border-oat" disabled>
        Registration opens {openAt?.toLocaleDateString()}
      </Button>
    );
  }

  if (isWindowClosed) {
    return (
      <Button className="w-full bg-ivory text-shadow border border-oat" disabled>
        Registration closed
      </Button>
    );
  }

  const handleDirectRegister = async () => {
    try {
      await registerMutation.mutateAsync({ id: event.id, responses: [] });
      toast.success('Successfully registered!');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to register');
    }
  };

  const handleCustomFormSubmit = async (responses: any[]) => {
    try {
      await registerMutation.mutateAsync({ id: event.id, responses });
      toast.success('Successfully registered!');
      setIsModalOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to register');
    }
  };

  return (
    <>
      <Button
        className="w-full"
        onClick={() => {
          if (customFields.length > 0) {
            setIsModalOpen(true);
          } else {
            handleDirectRegister();
          }
        }}
        loading={registerMutation.isPending}
      >
        {registerMutation.isPending ? 'Registering...' : 'Register now'}
      </Button>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Register for ${event.title}`}
      >
        <div className="p-4">
          <p className="text-sm text-shadow mb-4">
            Please fill out the following fields to complete your registration.
          </p>
          <CustomFieldForm
            fields={customFields}
            onSubmit={handleCustomFormSubmit}
            loading={registerMutation.isPending}
          />
        </div>
      </Modal>
    </>
  );
}
