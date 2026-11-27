import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';
import { PracticeSession } from '@/components/PracticeSession';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect('/login');
  const { id } = await params;
  return <PracticeSession sessionId={id} />;
}
