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

  // A bare letter after a verb ("pick b") is only a leak signal for letters
  // that aren't also English words: "pick a smaller example" is not a leak.
  const bareLetterOk = key !== 'a' && key !== 'i';
  const letter = `[(\\[]?${key}[)\\]]?(?![a-z0-9'’-])`;
  const letterPatterns = [
    new RegExp(`\\b(?:option|choice|answer)\\s*(?:is\\s*|:\\s*)?${letter}`, 'i'),
    new RegExp(`\\b(?:the\\s+)?(?:correct|right)\\s+(?:one|answer|option|choice)\\s+is\\s*${letter}`, 'i'),
    new RegExp(`\\b(?:pick|choose|select|go with)\\s+(?:option\\s+)?[(\\[]${key}[)\\]](?![a-z0-9])`, 'i'),
    ...(bareLetterOk ? [new RegExp(`\\b(?:pick|choose|select|go with)\\s+(?:option\\s+)?${letter}`, 'i')] : []),
  ];

  // True/false (and yes/no) answers are one word, so the text check can't
  // use them. Catch the phrasings that state the verdict outright.
  const verdict = /^(true|false|yes|no)$/.test(answer) ? answer : null;
  const verdictPatterns = verdict
    ? [new RegExp(`\\b(?:the\\s+)?(?:answer|statement)\\s+is\\s+${verdict}\\b`), new RegExp(`\\bit(?:s|\\s+is)\\s+${verdict}\\b`)]
    : [];

  return (text: string): string | null => {
    const n = norm(text);
    if (distinctive && n.includes(answer)) return 'quoted the correct option';
    for (const p of letterPatterns) if (p.test(text)) return 'named the correct option letter';
    for (const p of verdictPatterns) if (p.test(n)) return 'stated the true/false verdict';
    if (/\b(?:the\s+)?answer\s+is\b/i.test(text) && distinctive && n.includes(answer.slice(0, Math.max(8, Math.floor(answer.length * 0.7))))) {
      return 'stated the answer';
    }
    return null;
  };
}
