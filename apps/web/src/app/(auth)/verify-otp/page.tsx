'use client';

// OTP verification is handled inline within the login page (phone tab → OTP step).
// This page exists as a named route but redirects to login to avoid a dead URL.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyOtpPage() {
  const router = useRouter();

  useEffect(() => {
    // OTP flow is embedded in the login page phone tab; redirect there.
    router.replace('/login');
  }, [router]);

  return null;
}
