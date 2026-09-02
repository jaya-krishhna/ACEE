'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useEventRegistrations } from '@/lib/queries';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function RegistrantsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, error } = useEventRegistrations(eventId, {
    page,
    limit: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  if (error) {
    return (
      <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-6 rounded-[10px] text-center">
        Failed to load registrants
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-oat">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-espresso">Registrants</h1>
          <p className="text-sm text-shadow font-sans">Manage registrations for this event</p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={() => router.push('/admin')}>
            Back to dashboard
          </Button>
          <div className="w-48">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { label: 'All statuses', value: '' },
                { label: 'Registered', value: 'registered' },
                { label: 'Confirmed', value: 'confirmed' },
                { label: 'Waitlisted', value: 'waitlisted' },
                { label: 'Cancelled', value: 'cancelled' },
              ]}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No registrants found"
          description={
            statusFilter
              ? 'No registrants match the selected filter.'
              : 'No one has registered for this event yet.'
          }
          action={
            statusFilter ? (
              <Button onClick={() => setStatusFilter('')}>Clear filter</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-ivory rounded-[10px] shadow-sm border border-oat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-oat">
              <thead className="bg-oat/20">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Registered At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Responses
                  </th>
                </tr>
              </thead>
              <tbody className="bg-ivory divide-y divide-oat">
                {data.data.map((reg) => (
                  <tr key={reg.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-espresso font-serif">
                        {reg.student.name}
                      </div>
                      <div className="text-sm text-shadow">{reg.student.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={reg.status}>{reg.status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={reg.payment_status}>
                        {reg.payment_status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                      {format(new Date(reg.registered_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-6 py-4 text-sm text-espresso max-w-xs truncate">
                      {reg.responses && reg.responses.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {reg.responses.slice(0, 2).map((r, i) => (
                            <span key={i} className="truncate" title={`${r.label}: ${r.value}`}>
                              <span className="font-medium">{r.label}:</span> {r.value}
                            </span>
                          ))}
                          {reg.responses.length > 2 && (
                            <span className="text-xs text-shadow">
                              +{reg.responses.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-shadow">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-oat">
              <Pagination page={page} totalPages={data.totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
