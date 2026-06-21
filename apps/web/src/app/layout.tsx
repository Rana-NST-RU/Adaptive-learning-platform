import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

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
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
