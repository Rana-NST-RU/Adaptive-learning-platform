// ─────────────────────────────────────────────────────────────────────────────
// Item pipeline: Author → Verifier (per item) → bank.
// Accepted items go live with an Elo difficulty from the reconciled level and
// are calibrated online from real answers. Rejected drafts are kept (status
// 'rejected') with verifier notes, as eval data.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { authoredDifficultyToLogit } from '@alp/engine';
import { db, schema } from '../../db';
import { searchKnowledge } from '../../rag/retrieve';
import { withAgentRun } from '../runtime';
import { runItemAuthor } from './author';
import { verifyItem } from './verifier';
import { levelFromLogit } from './rules';

/** Don't keep growing a concept's bank beyond this without a targeted reason. */
export const MAX_ACTIVE_PER_CONCEPT = 15;

export interface GenerateRequest {
  conceptId: string;
  userId?: string | null;
  trigger: string;
  count?: number;
  idealDifficulty?: number;
  targetMisconceptionId?: string | null;
}

export interface GenerateResult {
  generated: number;
  accepted: number;
  rejected: number;
  skipped?: string;
}

export async function generateItems(req: GenerateRequest): Promise<GenerateResult> {
  const concept = await db.query.concepts.findFirst({ where: eq(schema.concepts.id, req.conceptId) });
  if (!concept) throw new Error(`Concept ${req.conceptId} not found`);

  const existing = await db
    .select({ stem: schema.items.stem })
    .from(schema.items)
    .where(and(eq(schema.items.conceptId, concept.id), inArray(schema.items.status, ['active', 'flagged'])));
  if (existing.length >= MAX_ACTIVE_PER_CONCEPT && !req.targetMisconceptionId) {
    return { generated: 0, accepted: 0, rejected: 0, skipped: 'pool already full' };
  }

  const count = Math.min(5, req.count ?? 3);
  const targetLevel = levelFromLogit(req.idealDifficulty ?? 0);

  const drafts = await withAgentRun(
    {
      agent: 'author',
      trigger: req.trigger,
      userId: req.userId,
      input: { conceptId: concept.id, count, targetLevel, targetMisconceptionId: req.targetMisconceptionId ?? null },
    },
    async (run) => {
      const out = await runItemAuthor(run, {
        courseId: concept.courseId,
        concept: {
          id: concept.id,
          name: concept.name,
          summary: concept.summary,
          objectives: concept.objectives,
          misconceptions: concept.misconceptions,
        },
        count,
        targetLevel,
        targetMisconceptionId: req.targetMisconceptionId,
        existingStems: existing.map((e) => e.stem),
      });
      return { output: out, summary: `Wrote ${out.length} new question${out.length === 1 ? '' : 's'} on ${concept.name}` };
    },
  );

  let accepted = 0;
  const letters = 'abcde';
  await Promise.all(
    drafts.map(async (draft) => {
      const sources = draft.citations.length
        ? (await searchKnowledge({ courseId: concept.courseId, conceptId: concept.id, query: draft.stem, k: 8 })).filter((s) =>
            draft.citations.includes(s.id),
          )
        : [];
      const verified = await withAgentRun(
        { agent: 'verifier', trigger: req.trigger, userId: req.userId, input: { conceptId: concept.id, stem: draft.stem } },
        async (run) => {
          const v = await verifyItem(run, draft, concept, sources);
          return {
            output: v,
            summary: v.decision.accept ? `Verified a new ${concept.name} question` : `Rejected a flawed ${concept.name} question`,
          };
        },
      );
      const d = verified.draft;
      const answerIndex = d.options.findIndex((o) => o.correct);
      await db.insert(schema.items).values({
        conceptId: concept.id,
        format: d.options.length === 2 ? 'true_false' : d.code ? 'code_output' : 'mcq',
        stem: d.stem,
        code: d.code,
        codeLanguage: d.codeLanguage,
        options: d.options.map((o, i) => ({
          id: letters[i]!,
          text: o.text,
          misconceptionId: o.correct ? null : o.misconceptionId,
          feedback: o.feedback,
        })),
        answer: letters[answerIndex]!,
        explanation: d.explanation,
        hints: d.hints,
        authoredLevel: verified.decision.level,
        difficulty: authoredDifficultyToLogit(verified.decision.level),
        bloom: d.bloom,
        citations: d.citations,
        source: 'agent',
        status: verified.decision.accept ? 'active' : 'rejected',
        verifierNotes: verified.decision.notes,
        createdBy: `agent:author`,
      });
      if (verified.decision.accept) accepted++;
    }),
  );

  return { generated: drafts.length, accepted, rejected: drafts.length - accepted };
}
