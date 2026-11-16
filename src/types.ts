/** One day's rates, in rupees. Gold is per gram, silver is per gram. */
export type DayRate = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  gold22: number;
  gold24: number;
  silver: number;
};

/** The file the app downloads. Written by scripts/update-rates.mjs. */
export type RatesFile = {
  /** ISO timestamp of the last successful update */
  updatedAt: string;
  /** Human-readable name of where the rates came from */
  source: string;
  /** True when the numbers are placeholders, not real market rates */
  sample: boolean;
  /** Oldest first. The last entry is the latest rate. */
  history: DayRate[];
};

export type Metal = 'gold22' | 'gold24' | 'silver';
