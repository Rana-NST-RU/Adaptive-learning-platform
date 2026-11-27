// Small, dependency-free statistics helpers for the eval suites.

/** Seeded PRNG (mulberry32): same seed → same run, so reports are comparable. */
export function rng(seed: number) {
  let s = seed | 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    uniform: (a: number, b: number) => a + (b - a) * next(),
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    /** Standard normal (Box–Muller). */
    normal: (mu = 0, sd = 1) => mu + sd * Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next()),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
}
export type Rng = ReturnType<typeof rng>;

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Area under the ROC curve via the rank-sum (Mann–Whitney) statistic, with
 * ties counted as half. Returns NaN if either class is empty.
 */
export function auc(scores: number[], labels: boolean[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i]! })).sort((a, b) => a.s - b.s);
  let pos = 0;
  let neg = 0;
  let rankSum = 0;
  for (let i = 0; i < pairs.length; ) {
    let j = i;
    while (j < pairs.length && pairs[j]!.s === pairs[i]!.s) j++;
    const avgRank = (i + 1 + j) / 2; // 1-based average rank of the tie group
    for (let k = i; k < j; k++) {
      if (pairs[k]!.y) {
        pos++;
        rankSum += avgRank;
      } else neg++;
    }
    i = j;
  }
  if (!pos || !neg) return NaN;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Root-mean-square error between probabilities and 0/1 outcomes. */
export function rmse(p: number[], y: boolean[]): number {
  return Math.sqrt(mean(p.map((x, i) => (x - (y[i] ? 1 : 0)) ** 2)));
}

/** Reliability bins: mean predicted vs observed rate, and expected calibration error (ECE). */
export function reliability(p: number[], y: boolean[], bins = 10) {
  const rows = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, pred: 0, obs: 0 }));
  p.forEach((x, i) => {
    const b = rows[Math.min(bins - 1, Math.floor(x * bins))]!;
    b.n++;
    b.pred += x;
    b.obs += y[i] ? 1 : 0;
  });
  const used = rows.filter((r) => r.n > 0).map((r) => ({ ...r, pred: r.pred / r.n, obs: r.obs / r.n }));
  const ece = used.reduce((a, r) => a + (r.n / p.length) * Math.abs(r.pred - r.obs), 0);
  return { bins: used, ece };
}
