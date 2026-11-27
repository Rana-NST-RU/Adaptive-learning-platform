// ─────────────────────────────────────────────────────────────────────────────
// Answer-leak guard for the Tutor (docs/EVALS.md §4: "answer leakage ≤ 2%").
// The Tutor holds the key (so it never invents wrong physics/maths), but until
// the learner has answered, it must not reveal it. The prompt asks for that.
// This deterministic check enforces it on the streamed text, so a slip is cut
// off mid-stream rather than shown.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[`*_"'“”‘’]/g, '').replace(/\s+/g, ' ').trim();

export interface LeakTarget {
  /** Option id of the correct answer, e.g. "b". */
  answerId: string;
  /** Text of the correct option. */
  answerText: string;
  /** All option texts (used to avoid flagging text shared with wrong options). */
  optionTexts: string[];
}

export function makeLeakDetector(t: LeakTarget) {
  const key = t.answerId.toLowerCase();
  const answer = norm(t.answerText);
  // Only flag the answer text when it is distinctive: long enough and not a
  // substring of a wrong option (e.g. "O(n)" vs "O(n log n)").
  const others = t.optionTexts.map(norm).filter((o) => o !== answer);
  const distinctive = answer.length >= 8 && !others.some((o) => o.includes(answer));

  const letterPatterns = [
    new RegExp(`\\b(?:option|choice|answer)\\s*(?:is\\s*)?[(\\[]?${key}[)\\]]?(?![a-z0-9])`, 'i'),
    new RegExp(`\\b(?:the\\s+)?(?:correct|right)\\s+(?:one|answer|option|choice)\\s+is\\s*[(\\[]?${key}[)\\]]?(?![a-z0-9])`, 'i'),
    new RegExp(`(?:pick|choose|select|go with)\\s+[(\\[]?${key}[)\\]](?![a-z0-9])`, 'i'),
  ];

  return (text: string): string | null => {
    const n = norm(text);
    if (distinctive && n.includes(answer)) return 'quoted the correct option';
    for (const p of letterPatterns) if (p.test(text)) return 'named the correct option letter';
    if (/\b(?:the\s+)?answer\s+is\b/i.test(text) && distinctive && n.includes(answer.slice(0, Math.max(8, Math.floor(answer.length * 0.7))))) {
      return 'stated the answer';
    }
    return null;
  };
}
