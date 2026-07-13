'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker at /sw.js.
 * Mounted as a client component inside the root layout so it doesn't
 * affect server-side rendering.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);

        // Trigger SW update check on each page load
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  }, []);

  return null; // Renders nothing — side-effect only
}
