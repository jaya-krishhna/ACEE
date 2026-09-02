'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export default function RegisterPage() {
  const router = useRouter();
  const { registerOrganizer } = useAuth();

  const [formData, setFormData] = useState({
    orgName: '',
    orgType: 'college',
    orgEmail: '',
    websiteUrl: '',
    logoUrl: '',
    ownerName: '',
    ownerEmail: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await registerOrganizer({
        organization: {
          name: formData.orgName,
          org_type: formData.orgType as any,
          contact_email: formData.orgEmail,
          website_url: formData.websiteUrl,
          logo_url: formData.logoUrl,
        },
        owner: {
          name: formData.ownerName,
          email: formData.ownerEmail,
          password: formData.password,
        },
      });
      router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sunlit flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <h2 className="mt-6 text-center text-3xl font-serif font-bold tracking-tight text-espresso">
          Register your organization
        </h2>
        <p className="mt-2 text-center text-sm text-shadow font-sans">
          Create an organizer account to manage events
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-ivory border border-oat rounded-[10px] py-8 px-4 shadow-sm sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-3 rounded-[10px] text-sm">
                {error}
              </div>
            )}

            <div>
              <h3 className="text-lg font-serif font-bold text-espresso mb-4 border-b border-oat pb-2">
                Organization details
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Organization name"
                  name="orgName"
                  required
                  value={formData.orgName}
                  onChange={handleChange}
                />
                <Select
                  label="Organization type"
                  name="orgType"
                  required
                  value={formData.orgType}
                  onChange={handleChange}
                  options={[
                    { label: 'College', value: 'college' },
                    { label: 'Company', value: 'company' },
                    { label: 'Community', value: 'community' },
                    { label: 'Individual', value: 'individual' },
                  ]}
                />
                <Input
                  label="Contact email"
                  type="email"
                  name="orgEmail"
                  required
                  value={formData.orgEmail}
                  onChange={handleChange}
                />
                <Input
                  label="Website URL"
                  type="url"
                  name="websiteUrl"
                  value={formData.websiteUrl}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-serif font-bold text-espresso mb-4 border-b border-oat pb-2">
                Owner details
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Your name"
                  name="ownerName"
                  required
                  value={formData.ownerName}
                  onChange={handleChange}
                />
                <Input
                  label="Your email"
                  type="email"
                  name="ownerEmail"
                  required
                  value={formData.ownerEmail}
                  onChange={handleChange}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Password"
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Register
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-shadow">Already have an account? </span>
            <Link href="/admin/auth/login" className="font-medium text-burgundy hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
