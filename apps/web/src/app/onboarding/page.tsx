import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';
import { db, schema } from '@/server/db';
import { Onboarding } from '@/components/Onboarding';
import { visibleCourses } from '@/server/learner/visibility';
import { agentsEnabled } from '@/server/agents/runtime';

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const courses = await db.query.courses.findMany({ where: visibleCourses(user.id) });
  return (
    <Onboarding
      name={user.name}
      courses={courses.map((c) => ({ id: c.id, title: c.title, description: c.description }))}
      canBuild={agentsEnabled()}
    />
  );
}
