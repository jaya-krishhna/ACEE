'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { AdminNav } from '@/components/layout/AdminNav';
import { Spinner } from '@/components/ui/Skeleton';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAuthPage = pathname?.startsWith('/admin/auth');

  useEffect(() => {
    if (!isLoading && !isAuthPage && (!user || user.role !== 'organizer')) {
      router.replace('/admin/auth/login?reason=session_expired');
    }
  }, [user, isLoading, router, isAuthPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sunlit flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (!user || user.role !== 'organizer') {
    // Will redirect, show nothing
    return null;
  }

  return (
    <div className="min-h-screen bg-sunlit text-espresso">
      <AdminNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
