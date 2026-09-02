'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Compass, Heart, CalendarDays, User, LogOut, LogIn } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

export function StudentSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.push('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const navItems = [
    {
      href: '/',
      label: 'Browse events',
      icon: Compass,
      requiresAuth: false,
      disabled: false,
    },
    {
      href: '/saved',
      label: 'Saved events',
      icon: Heart,
      requiresAuth: true,
      disabled: false,
    },
    {
      href: '/me/registrations',
      label: 'My registrations',
      icon: CalendarDays,
      requiresAuth: true,
      disabled: false,
    },
    {
      href: '#',
      label: 'Profile',
      icon: User,
      requiresAuth: false,
      disabled: true,
    },
  ];

  const handleNavClick = (e: React.MouseEvent, item: (typeof navItems)[0]) => {
    if (item.disabled) {
      e.preventDefault();
      return;
    }
    if (item.requiresAuth && !user) {
      e.preventDefault();
      toast.error('Please sign in to access this page');
      router.push('/auth/login');
    }
  };

  return (
    <aside className="w-64 shrink-0 hidden md:block">
      <div className="sticky top-20 bg-sunlit border border-oat rounded-[10px] p-4 space-y-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase text-shadow tracking-wider">
          Navigation
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => handleNavClick(e, item)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-sm font-medium transition-colors',
                item.disabled && 'opacity-40 cursor-not-allowed text-shadow',
                !item.disabled &&
                  isActive &&
                  'bg-ivory text-espresso font-semibold border border-oat/60 shadow-sm',
                !item.disabled && !isActive && 'text-shadow hover:text-espresso hover:bg-ivory/60',
              )}
            >
              <Icon size={18} className={clsx(isActive ? 'text-burgundy' : 'text-shadow')} />
              <span>{item.label}</span>
              {item.disabled && (
                <span className="ml-auto text-[10px] uppercase font-bold text-shadow/60 bg-oat/30 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-oat space-y-1">
          {user ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-sm font-medium text-shadow hover:text-burgundy hover:bg-ivory/60 transition-colors"
            >
              <LogOut size={18} className="text-shadow" />
              <span>Sign out</span>
            </button>
          ) : (
            <Link
              href="/auth/login"
              className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-sm font-medium text-burgundy hover:bg-ivory/60 transition-colors"
            >
              <LogIn size={18} />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
