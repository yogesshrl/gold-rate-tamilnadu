import type { DayRate, Metal } from '../types';

export type Change = {
  amount: number;
  percent: number;
  direction: 'up' | 'down' | 'same';
};

export function change(from: number, to: number): Change {
  const amount = Math.round((to - from) * 100) / 100;
  const percent = from === 0 ? 0 : Math.round(((to - from) / from) * 10000) / 100;
  return { amount, percent, direction: amount > 0 ? 'up' : amount < 0 ? 'down' : 'same' };
}

/** Change between the latest day and the day before it. Null with fewer than two days. */
export function changeSinceYesterday(history: DayRate[], metal: Metal): Change | null {
  if (history.length < 2) return null;
  return change(history[history.length - 2][metal], history[history.length - 1][metal]);
}

/** The last `days` entries, oldest first. */
export function lastDays(history: DayRate[], days: number): DayRate[] {
  return history.slice(Math.max(0, history.length - days));
}

export type Lookback = {
  boughtOn: string;
  thenValue: number;
  nowValue: number;
  change: Change;
};

/**
 * "If you had bought `grams` of this metal `daysAgo` days back, what is it worth now?"
 * Uses the closest recorded day on or before the target date.
 * Null when history does not reach back that far.
 */
export function lookback(
  history: DayRate[],
  metal: Metal,
  grams: number,
  daysAgo: number,
): Lookback | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const target = new Date(latest.date + 'T00:00:00Z');
  target.setUTCDate(target.getUTCDate() - daysAgo);
  const targetIso = target.toISOString().slice(0, 10);

  if (history[0].date > targetIso) return null;

  let past = history[0];
  for (const day of history) {
    if (day.date <= targetIso) past = day;
    else break;
  }

  const thenValue = Math.round(past[metal] * grams * 100) / 100;
  const nowValue = Math.round(latest[metal] * grams * 100) / 100;
  return { boughtOn: past.date, thenValue, nowValue, change: change(thenValue, nowValue) };
}

/** Adds or replaces a day's rate, keeping the list sorted oldest first. */
export function upsertDay(history: DayRate[], day: DayRate): DayRate[] {
  const without = history.filter((d) => d.date !== day.date);
  return [...without, day].sort((a, b) => a.date.localeCompare(b.date));
}
