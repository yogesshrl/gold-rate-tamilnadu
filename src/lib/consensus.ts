export type Reading = { source: string; value: number };

export type Consensus = {
  value: number;
  /** Sources whose readings agreed with each other */
  agreed: string[];
  /** Sources that were read but disagreed with the majority */
  outliers: string[];
};

const median = (sorted: number[]) => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Finds the largest group of readings that sit within `tolerancePercent` of each other
 * and returns its median. Returns null unless at least `minAgree` sources agree,
 * so one wrong or stale site can never set the rate by itself.
 */
export function consensus(readings: Reading[], tolerancePercent: number, minAgree = 2): Consensus | null {
  const sorted = [...readings].sort((a, b) => a.value - b.value);
  let best: Reading[] = [];

  for (let start = 0; start < sorted.length; start++) {
    const limit = sorted[start].value * (1 + tolerancePercent / 100);
    const group = sorted.slice(start).filter((r) => r.value <= limit);
    if (group.length > best.length) best = group;
  }

  if (best.length < minAgree) return null;
  const agreed = new Set(best.map((r) => r.source));
  return {
    value: Math.round(median(best.map((r) => r.value)) * 100) / 100,
    agreed: [...agreed],
    outliers: sorted.filter((r) => !agreed.has(r.source)).map((r) => r.source),
  };
}
