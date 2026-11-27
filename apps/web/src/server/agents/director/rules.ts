// ─────────────────────────────────────────────────────────────────────────────
// Session-plan schema + deterministic validation for the Learning Director.
// Pure (no I/O), unit-tested. The Director proposes; these rules decide
// whether the proposal is safe to apply. The engine clamps again on use.
// See docs/ARCHITECTURE.md §3 (#1) and §4.5.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { AffectState, ConceptStatus, UxMode } from '@alp/engine';
import type { SessionPlan } from '../../db/schema';

export const UX_MODES = ['focus', 'challenge', 'recovery', 'review', 'explore'] as const satisfies readonly UxMode[];

export const MAX_TARGET_DELTA = 0.1;
export const MIN_PLAN_MINUTES = 3;
export const MAX_PLAN_MINUTES = 20;

export const PlanDraft = z.object({
  headline: z.string().max(120).describe('One short line shown to the learner, e.g. "Two easier BFS warm-ups, then back to graphs"'),
  steps: z.array(z.string().max(140)).describe('1–4 short learner-facing steps for the next few minutes'),
  reason: z.string().max(240).describe('Learner-facing why, grounded in the snapshot (no ids, no jargon)'),
  focusConcept: z.string().nullable().describe('Slug of the concept to prioritise, or null to let the engine choose'),
  targetDelta: z
    .number()
    .describe('Shift of the target success rate, −0.1…+0.1. Positive = easier questions, negative = harder. 0 = no change'),
  modeOverride: z.enum(UX_MODES).nullable().describe('Force a UX mode, or null to let the engine pick from affect'),
  durationMinutes: z.number().int().describe(`How long this plan applies (${MIN_PLAN_MINUTES}–${MAX_PLAN_MINUTES} minutes)`),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export interface PlanContext {
  /** Concepts of the course, by slug. */
  concepts: Map<string, { id: string; name: string; status: ConceptStatus }>;
  affect: AffectState;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function validatePlan(p: PlanDraft, ctx: PlanContext): string[] {
  const errs: string[] = [];
  const text = (s: string) => s.trim().length;

  if (text(p.headline) < 8) errs.push('headline is too short; write one clear line for the learner');
  if (p.steps.length < 1 || p.steps.length > 4) errs.push('steps must have 1–4 entries');
  if (p.steps.some((s) => text(s) < 3)) errs.push('every step needs real text');
  if (text(p.reason) < 8) errs.push('reason is required: tell the learner why the plan changed');
  if ([p.headline, p.reason, ...p.steps].some((s) => UUID.test(s))) {
    errs.push('learner-facing text must not contain ids; use concept names');
  }

  if (!Number.isFinite(p.targetDelta) || Math.abs(p.targetDelta) > MAX_TARGET_DELTA) {
    errs.push(`targetDelta must be between -${MAX_TARGET_DELTA} and ${MAX_TARGET_DELTA}`);
  }
  if (!Number.isInteger(p.durationMinutes) || p.durationMinutes < MIN_PLAN_MINUTES || p.durationMinutes > MAX_PLAN_MINUTES) {
    errs.push(`durationMinutes must be a whole number from ${MIN_PLAN_MINUTES} to ${MAX_PLAN_MINUTES}`);
  }

  if (p.focusConcept !== null) {
    const c = ctx.concepts.get(p.focusConcept);
    if (!c) errs.push(`unknown focusConcept "${p.focusConcept}"; use a slug from the snapshot or null`);
    else if (c.status === 'locked') errs.push(`"${c.name}" is locked (prerequisites not met); focus on an available concept`);
  }

  // Guardrail: never push a struggling learner harder.
  if (ctx.affect === 'frustrated' || ctx.affect === 'disengaged') {
    if (p.targetDelta < 0) errs.push(`the learner is ${ctx.affect}; targetDelta must not be negative (no harder questions now)`);
    if (p.modeOverride === 'challenge') errs.push(`the learner is ${ctx.affect}; challenge mode is not allowed now`);
  }
  return errs;
}

/** Turn an accepted draft into the stored plan the engine reads. */
export function toSessionPlan(p: PlanDraft, ctx: PlanContext, trigger: string, now: Date = new Date()): SessionPlan {
  const delta = Math.max(-MAX_TARGET_DELTA, Math.min(MAX_TARGET_DELTA, p.targetDelta));
  return {
    headline: p.headline.trim(),
    steps: p.steps.map((s) => s.trim()),
    reasons: [p.reason.trim()],
    focusConceptId: p.focusConcept ? (ctx.concepts.get(p.focusConcept)?.id ?? null) : null,
    targetDelta: Math.round(delta * 100) / 100,
    modeOverride: p.modeOverride,
    expiresAt: new Date(now.getTime() + p.durationMinutes * 60_000).toISOString(),
    trigger,
    by: 'director',
  };
}
