'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { registerStudent } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await registerStudent(name, email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to register. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sunlit p-4">
      <div className="bg-ivory border border-oat rounded-[10px] w-full max-w-md p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif font-bold text-espresso mb-2">Student Registration</h1>
          <p className="text-sm text-shadow font-sans">
            Create an account to start exploring events.
          </p>
        </div>

        {error && (
          <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-3 rounded-[10px] text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" className="w-full mt-6" disabled={loading}>
            {loading ? 'Registering...' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-shadow">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-burgundy font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
