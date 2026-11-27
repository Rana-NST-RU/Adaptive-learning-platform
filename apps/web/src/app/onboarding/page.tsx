import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getUser } from '@/server/auth';
import { db, schema } from '@/server/db';
import { Onboarding } from '@/components/Onboarding';

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const courses = await db.query.courses.findMany({ where: eq(schema.courses.status, 'ready') });
  return (
    <Onboarding
      name={user.name}
      courses={courses.map((c) => ({ id: c.id, title: c.title, description: c.description }))}
    />
  );
}
