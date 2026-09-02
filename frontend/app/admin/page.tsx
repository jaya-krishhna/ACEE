'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  useOrganizerEvents,
  usePublishEvent,
  useUnpublishEvent,
  useDeleteEvent,
} from '@/lib/queries';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminDashboardPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useOrganizerEvents(page);

  const publishMutation = usePublishEvent();
  const unpublishMutation = useUnpublishEvent();
  const deleteMutation = useDeleteEvent();

  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [unpublishEventId, setUnpublishEventId] = useState<string | null>(null);

  const handlePublish = async (id: string) => {
    try {
      await publishMutation.mutateAsync(id);
      toast.success('Event published successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to publish event');
    }
  };

  const handleUnpublish = async () => {
    if (!unpublishEventId) return;
    try {
      await unpublishMutation.mutateAsync(unpublishEventId);
      toast.success('Event unpublished successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to unpublish event');
    } finally {
      setUnpublishEventId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteEventId) return;
    try {
      await deleteMutation.mutateAsync(deleteEventId);
      toast.success('Event deleted successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete event');
    } finally {
      setDeleteEventId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-oat">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-espresso">Events</h1>
          <p className="text-sm text-shadow font-sans">Manage your organization's events</p>
        </div>
        <Link href="/admin/events/new">
          <Button>Create event</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No events found"
          description="You haven't created any events yet."
          action={
            <Link href="/admin/events/new">
              <Button>Create your first event</Button>
            </Link>
          }
        />
      ) : (
        <div className="bg-ivory border border-oat rounded-[10px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-oat">
              <thead className="bg-oat/20">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Type & Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-espresso uppercase tracking-wider">
                    Registrations
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-espresso uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-ivory divide-y divide-oat">
                {data.data.map((event) => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-espresso font-serif">
                        {event.title}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge>{event.event_type}</Badge>
                        <span className="text-xs text-shadow capitalize">{event.mode}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso">
                      {format(new Date(event.event_start_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-espresso font-medium">
                      {event.registration_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/events/${event.id}/registrants`}>
                          <Button variant="secondary" size="sm">
                            Registrants
                          </Button>
                        </Link>
                        <Link href={`/admin/events/${event.id}/edit`}>
                          <Button variant="secondary" size="sm">
                            Edit
                          </Button>
                        </Link>
                        {event.status === 'draft' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handlePublish(event.id)}
                            loading={publishMutation.isPending}
                          >
                            Publish
                          </Button>
                        )}
                        {event.status === 'published' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setUnpublishEventId(event.id)}
                          >
                            Unpublish
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteEventId(event.id)}
                        >
                          Delete
                        </Button>
                      </div>
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

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteEventId}
        onClose={() => setDeleteEventId(null)}
        title="Delete event"
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmLoading={deleteMutation.isPending}
      >
        Are you sure you want to delete this event? This action cannot be undone.
      </Modal>

      {/* Unpublish Confirmation Modal */}
      <Modal
        open={!!unpublishEventId}
        onClose={() => setUnpublishEventId(null)}
        title="Unpublish event"
        onConfirm={handleUnpublish}
        confirmLabel="Unpublish"
        confirmVariant="primary"
        confirmLoading={unpublishMutation.isPending}
      >
        Are you sure you want to unpublish this event? It will no longer be visible to the public.
      </Modal>
    </div>
  );
}
