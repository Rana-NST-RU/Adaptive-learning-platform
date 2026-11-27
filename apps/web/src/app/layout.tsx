import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Adaptive Learning Platform',
  description: 'Adaptive practice steered by a learner model and a team of AI agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
