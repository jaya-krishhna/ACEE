'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Skeleton';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { acceptInvite } = useAuth();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!token) {
    return (
      <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-4 rounded-[10px] text-center space-y-4">
        <p>Invalid or missing invitation token. Please check your invitation link.</p>
        <div>
          <Link
            href="/admin/auth/login"
            className="text-sm font-medium text-burgundy hover:underline"
          >
            Go to Organizer Sign In &rarr;
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await acceptInvite(token, name, password);
      router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-3 rounded-[10px] text-sm">
          {error}
        </div>
      )}

      <Input
        label="Your name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Input
        label="Password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" className="w-full" isLoading={isLoading}>
        Accept invitation
      </Button>

      <div className="text-center text-sm pt-2">
        <span className="text-shadow">Already have an account? </span>
        <Link href="/admin/auth/login" className="font-medium text-burgundy hover:underline">
          Sign in here
        </Link>
      </div>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-sunlit flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-serif font-bold tracking-tight text-espresso">
          Accept invitation
        </h2>
        <p className="mt-2 text-center text-sm text-shadow font-sans">
          Join your organization's event management team
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-ivory border border-oat rounded-[10px] py-8 px-4 shadow-sm sm:px-10">
          <Suspense
            fallback={
              <div className="flex justify-center p-8">
                <Spinner size={32} />
              </div>
            }
          >
            <AcceptInviteForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
