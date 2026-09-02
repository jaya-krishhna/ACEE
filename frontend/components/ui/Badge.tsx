import React from 'react';
import { clsx } from 'clsx';
import type { EventStatus, RegistrationStatus, PaymentStatus } from '@/lib/types';

export type BadgeVariant =
  | 'default'
  | 'denim'
  | 'bordeaux'
  | 'danger'
  | 'success'
  | 'warning'
  | 'muted'
  | EventStatus
  | RegistrationStatus
  | PaymentStatus;

const variantClasses: Record<string, string> = {
  default: 'bg-oat/30 text-espresso border border-oat/50',
  denim: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  bordeaux: 'bg-burgundy/15 text-burgundy border border-burgundy/30',
  danger: 'bg-burgundy/15 text-burgundy border border-burgundy/30',
  success: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  warning: 'bg-oat/40 text-espresso border border-oat',
  muted: 'bg-oat/20 text-shadow border border-oat/30',
  // Event status badges
  draft: 'bg-oat/30 text-shadow border border-oat/50',
  published: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  registration_closed: 'bg-oat/40 text-espresso border border-oat',
  completed: 'bg-oat/20 text-shadow border border-oat/30',
  hidden: 'bg-burgundy/15 text-burgundy border border-burgundy/30',
  archived: 'bg-oat/20 text-shadow border border-oat/30',
  // Registration & payment status badges
  registered: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  confirmed: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  waitlisted: 'bg-oat/40 text-espresso border border-oat',
  cancelled: 'bg-burgundy/15 text-burgundy border border-burgundy/30',
  pending: 'bg-oat/40 text-espresso border border-oat',
  paid: 'bg-burgundy/10 text-burgundy border border-burgundy/20',
  failed: 'bg-burgundy/15 text-burgundy border border-burgundy/30',
  not_applicable: 'bg-oat/20 text-shadow border border-oat/30',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={clsx('chip', variantClasses[variant] ?? variantClasses.default, className)}>
      {children}
    </span>
  );
}

/** Convenience: renders a human-readable label for an EventStatus */
export function StatusBadge({ status }: { status: EventStatus }) {
  const labels: Record<EventStatus, string> = {
    draft: 'draft',
    published: 'published',
    registration_closed: 'registration closed',
    completed: 'completed',
    hidden: 'hidden',
    archived: 'archived',
  };
  return <Badge variant={status}>{labels[status] ?? status}</Badge>;
}
