'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth/context';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 1000 * 60, // 1 minute default
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--ivory-cream)',
              color: 'var(--deep-charcoal)',
              border: '1px solid rgba(38,36,36,0.1)',
              borderRadius: '10px',
              fontSize: '0.875rem',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
