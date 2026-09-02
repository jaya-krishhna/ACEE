'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { loginStudent } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await loginStudent(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sunlit p-4">
      <div className="bg-ivory border border-oat rounded-[10px] w-full max-w-md p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif font-bold text-espresso mb-2">Student Sign In</h1>
          <p className="text-sm text-shadow font-sans">Welcome back! Please enter your details.</p>
        </div>

        {error && (
          <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-3 rounded-[10px] text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-shadow">
          Don't have an account?{' '}
          <Link href="/auth/register" className="text-burgundy font-medium hover:underline">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
