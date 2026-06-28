'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    const refreshParam = params.get('refresh');
    const userParam = params.get('user');
    const error = params.get('error');

    if (error || !token || !userParam) {
      console.error('OAuth callback error:', error);
      router.replace('/login?error=oauth_failed');
      return;
    }

    try {
      const user = JSON.parse(atob(decodeURIComponent(userParam)));
      localStorage.setItem('access_token', decodeURIComponent(token));
      localStorage.setItem('user', JSON.stringify(user));
      if (refreshParam) {
        localStorage.setItem('refresh_token', decodeURIComponent(refreshParam));
      }
      router.replace('/dashboard');
    } catch (err) {
      console.error('Failed to parse OAuth response:', err);
      router.replace('/login?error=oauth_failed');
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060614]">
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
        </div>
        <p className="text-white font-semibold text-lg">Signing you in…</p>
        <p className="text-slate-500 text-sm mt-1">Finishing up with Google</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#060614]">
        <div className="w-8 h-8 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
