// Wires agents into the Conductor's job queue. Imported lazily by the
// Conductor so there is no import cycle. Registers nothing without a Claude
// credential, so the platform runs on the seed bank alone.
import 'server-only';
import { registerJobHandler } from '../conductor';
import { agentsEnabled, BudgetExceededError } from './runtime';
import { generateItems } from './items/pipeline';
import { diagnoseRecurring } from './diagnostician';
import { buildCourse } from './architect/architect';

let registered = false;

export function registerAgents() {
  if (registered || !agentsEnabled()) return;
  registered = true;

  registerJobHandler('author_items', async (p) => {
    try {
      await generateItems({
        conceptId: String(p.conceptId),
        userId: (p.userId as string) || null,
        trigger: p.targetMisconceptionId ? 'misconception_repeat' : 'pool_low',
        idealDifficulty: typeof p.idealDifficulty === 'number' ? p.idealDifficulty : undefined,
        targetMisconceptionId: (p.targetMisconceptionId as string) ?? null,
      });
    } catch (e) {
      if (e instanceof BudgetExceededError) return; // not a failure: the seed bank covers it
      throw e;
    }
  });

  // Goal (+ material) → Librarian indexes → Architect designs → course opens.
  registerJobHandler('build_course', async (p) => {
    await buildCourse({ courseId: String(p.courseId) });
  });

  // Recurring misconception → Diagnostician writes a note into learner memory.
  registerJobHandler('remember', async (p) => {
    try {
      await diagnoseRecurring({
        userId: String(p.userId),
        conceptId: String(p.conceptId),
        misconceptionId: String(p.misconceptionId),
      });
    } catch (e) {
      if (e instanceof BudgetExceededError) return;
      throw e;
    }
  });
}
