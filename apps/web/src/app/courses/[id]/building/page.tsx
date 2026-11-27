import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';
import { BuildProgress } from '@/components/BuildProgress';

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) redirect('/login');
  return <BuildProgress courseId={(await params).id} />;
}
