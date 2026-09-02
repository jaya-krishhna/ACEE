'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/Button';
import { LogOut, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { OrganizerUser } from '@/lib/types';

export function AdminNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const orgUser = user?.role === 'organizer' ? (user as OrganizerUser) : null;

  const navLinks = [
    { href: '/admin', label: 'Events', exact: true },
    ...(orgUser?.membershipRole === 'owner'
      ? [{ href: '/admin/members', label: 'Members', exact: false }]
      : []),
  ];

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        {/* Logo */}
        <Link
          href="/admin"
          className="font-serif font-bold text-espresso text-xl tracking-tight shrink-0 flex items-center gap-2"
        >
          <span className="w-8 h-8 rounded-[8px] bg-burgundy text-sunlit flex items-center justify-center text-sm font-sans font-bold">
            E
          </span>
          <span>Eventsy</span>
          <span className="bg-burgundy/10 text-burgundy border border-burgundy/20 text-[10px] uppercase font-sans font-semibold px-2 py-0.5 rounded-full ml-1">
            Organizer
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map((link) => {
            const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'px-3 py-1.5 rounded-[8px] text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-ivory text-espresso font-semibold border border-oat'
                    : 'text-shadow hover:text-espresso hover:bg-ivory/60',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Auth actions */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/admin/events/new">
            <Button size="sm">
              <Plus size={14} />
              New event
            </Button>
          </Link>
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-shadow font-medium hidden sm:block">{user.name}</span>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-[8px] text-shadow hover:text-burgundy hover:bg-ivory transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
