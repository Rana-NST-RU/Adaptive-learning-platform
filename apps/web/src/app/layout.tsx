import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import NotificationToaster from '@/components/NotificationToaster';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'ALOS — Adaptive Learning OS',
  description:
    'Master DSA & System Design with an AI-powered adaptive learning platform that tracks your progress and personalizes your path.',
  keywords: ['DSA', 'System Design', 'Learning', 'FAANG', 'Adaptive'],
  openGraph: {
    title: 'ALOS — Adaptive Learning OS',
    description: 'AI-powered adaptive learning for DSA & System Design',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
        <NotificationToaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
