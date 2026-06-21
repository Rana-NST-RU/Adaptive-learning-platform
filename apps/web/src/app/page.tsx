import { redirect } from 'next/navigation';

/**
 * Root page — redirects to login.
 * After auth, users land on /dashboard.
 */
export default function RootPage() {
  redirect('/login');
}
