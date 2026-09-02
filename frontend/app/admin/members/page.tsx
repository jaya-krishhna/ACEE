'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/auth/context';
import { useInviteMember } from '@/lib/queries';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function MembersPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string } | null>(null);
  const inviteMutation = useInviteMember();

  if (!user || user.role !== 'organizer' || user.membershipRole !== 'owner') {
    return (
      <div className="bg-ivory border border-burgundy/30 p-8 rounded-[10px] text-center max-w-2xl mx-auto mt-12">
        <h2 className="text-xl font-serif font-bold text-burgundy mb-2">Access Denied</h2>
        <p className="text-shadow">
          This action is owner-only. Only the organization owner can invite new members.
        </p>
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      const response = await inviteMutation.mutateAsync(email);
      setInviteResult({ token: response.token, email });
      toast.success('Invitation sent successfully');
      setEmail('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invitation');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="pb-4 border-b border-oat">
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-espresso">Team Members</h1>
        <p className="text-sm text-shadow font-sans">
          Invite people to help manage your organization's events.
        </p>
      </div>

      <div className="bg-ivory border border-oat rounded-[10px] p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-serif font-bold text-espresso mb-4">Invite a new member</h3>
          <form onSubmit={handleInvite} className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                label="Email address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <Button type="submit" isLoading={inviteMutation.isPending}>
              Send invite
            </Button>
          </form>
        </div>

        {inviteResult && (
          <div className="mt-8 p-6 bg-sunlit border-2 border-dashed border-burgundy/40 rounded-[10px]">
            <h4 className="font-serif font-bold text-burgundy mb-2 flex items-center gap-2">
              <span>🛠️</span> Development only — invitation token
            </h4>
            <p className="text-sm text-shadow mb-4">
              In a real application, an email would be sent to <strong>{inviteResult.email}</strong>
              . For this demo, copy the link below and open it in an incognito window to accept the
              invitation.
            </p>

            <div className="bg-ivory p-3 rounded border border-oat font-mono text-sm break-all select-all text-espresso">
              http://localhost:3000/admin/auth/accept-invite?token={inviteResult.token}
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => {
                navigator.clipboard.writeText(
                  `http://localhost:3000/admin/auth/accept-invite?token=${inviteResult.token}`,
                );
                toast.success('Link copied to clipboard');
              }}
            >
              Copy link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
