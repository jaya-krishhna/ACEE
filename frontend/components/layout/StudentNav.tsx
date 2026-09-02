'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/Button';
import { LogOut, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export function StudentNav() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-sunlit/95 backdrop-blur-sm border-b border-oat">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link
          href="/"
          className="font-serif font-bold text-espresso text-xl tracking-tight shrink-0 flex items-center gap-2"
        >
          <span className="w-8 h-8 rounded-[8px] bg-burgundy text-sunlit flex items-center justify-center text-sm font-sans font-bold">
            E
          </span>
          <span>Eventsy</span>
        </Link>

        {/* Auth State Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ivory border border-oat text-xs font-medium text-espresso">
                <UserIcon size={14} className="text-burgundy" />
                <span className="max-w-[120px] truncate">{user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-[8px] text-shadow hover:text-burgundy hover:bg-ivory transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/auth/login"
                className="text-sm font-medium text-espresso hover:text-burgundy transition-colors"
              >
                Sign in
              </Link>
              <Link href="/auth/register">
                <Button size="sm">Get started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
