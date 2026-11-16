/**
 * Fetches today's rate from the configured provider and saves it into data/rates.json,
 * keeping every past day so the app can show history.
 *
 * Run:  node scripts/update-rates.ts
 *
 * Providers (set RATE_PROVIDER):
 *   jewellers - default. Reads public rate pages and saves the value at least two agree on.
 *   manual  - reads GOLD22, GOLD24 and SILVER (rupees per gram) from the environment.
 *   ibja    - placeholder for the official IBJA API. Not wired up until API access is granted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { consensus, type Reading } from '../src/lib/consensus.ts';
import { upsertDay } from '../src/lib/history.ts';
import { fetchPage, SOURCES, type SourceReading } from './sources.ts';
import type { DayRate, RatesFile } from '../src/types.ts';

const RATES_PATH = fileURLToPath(new URL('../data/rates.json', import.meta.url));
const MAX_DAYS = 365 * 3;
/** A bigger one-day jump than this is treated as bad data and rejected. */
const MAX_DAILY_MOVE_PERCENT = 10;

type Rates = Omit<DayRate, 'date'>;
type Provider = { name: string; fetchToday: () => Promise<Rates & { sourceLabel?: string }> };

/** Gold sources must agree within this percentage; silver varies more between shops. */
const GOLD_TOLERANCE_PERCENT = 0.25;
const SILVER_TOLERANCE_PERCENT = 5;
const SILVER_FALLBACK_SOURCE = 'Live Chennai';

/**
 * Reads every source, drops any whose page says its rate is for another day,
 * and returns the value at least two sources agree on for each metal.
 */
export async function readJewellers(
  today: string,
  load: (url: string) => Promise<string | null> = fetchPage,
  log: (line: string) => void = console.log,
): Promise<Rates & { sourceLabel: string }> {
  const readings: { name: string; reading: SourceReading }[] = [];
  for (const source of SOURCES) {
    const html = await load(source.url);
    if (!html) {
      log(`${source.name}: could not load the page.`);
      continue;
    }
    const reading = source.parse(html);
    if (reading.statedDate && reading.statedDate !== today) {
      log(`${source.name}: rate is dated ${reading.statedDate}, not today. Skipped.`);
      continue;
    }
    log(`${source.name}: 22K ${reading.gold22 ?? '-'}, 24K ${reading.gold24 ?? '-'}, silver ${reading.silver ?? '-'}`);
    readings.push({ name: source.name, reading });
  }

  const agree = (metal: 'gold22' | 'gold24' | 'silver', tolerance: number) => {
    const values: Reading[] = readings.flatMap(({ name, reading }) => {
      const value = reading[metal];
      return value === null ? [] : [{ source: name, value }];
    });
    const result = consensus(values, tolerance);
    if (!result) throw new Error(`Fewer than two sources agree on ${metal}. Nothing saved.`);
    if (result.outliers.length) log(`${metal}: ignored ${result.outliers.join(', ')} (disagreed).`);
    return result;
  };

  const gold22 = agree('gold22', GOLD_TOLERANCE_PERCENT);
  const gold24 = agree('gold24', GOLD_TOLERANCE_PERCENT);
  // Silver prices differ between shops far more than gold. When they do not agree,
  // use the local market page rather than blocking the gold update.
  let silver: number;
  try {
    silver = agree('silver', SILVER_TOLERANCE_PERCENT).value;
  } catch (error) {
    const local = readings.find((r) => r.name === SILVER_FALLBACK_SOURCE)?.reading.silver;
    if (local === null || local === undefined) throw error;
    log(`silver: sources disagree, using ${SILVER_FALLBACK_SOURCE} (${local}).`);
    silver = local;
  }
  return {
    gold22: gold22.value,
    gold24: gold24.value,
    silver,
    sourceLabel: gold22.agreed.join(', '),
  };
}

const providers: Record<string, Provider> = {
  jewellers: {
    name: 'Tamil Nadu jewellers',
    fetchToday: () => readJewellers(todayInIndia()),
  },
  manual: {
    name: 'Manual entry',
    async fetchToday() {
      const read = (key: string) => {
        const value = Number(process.env[key]);
        if (!Number.isFinite(value)) throw new Error(`Set ${key} to a number (rupees per gram).`);
        return value;
      };
      return { gold22: read('GOLD22'), gold24: read('GOLD24'), silver: read('SILVER') };
    },
  },
  ibja: {
    name: 'IBJA benchmark rates',
    async fetchToday() {
      throw new Error('The IBJA provider is not configured yet. It needs official API access.');
    },
  },
};

export function validate(today: Rates, previous: DayRate | undefined): string | null {
  for (const key of ['gold22', 'gold24', 'silver'] as const) {
    if (!Number.isFinite(today[key]) || today[key] <= 0) return `${key} must be a positive number.`;
  }
  if (today.gold24 <= today.gold22) return '24K must cost more than 22K.';
  if (previous) {
    for (const key of ['gold22', 'gold24', 'silver'] as const) {
      const move = (Math.abs(today[key] - previous[key]) / previous[key]) * 100;
      if (move > MAX_DAILY_MOVE_PERCENT) {
        return `${key} moved ${move.toFixed(1)}% in one update, which looks wrong. Not saved.`;
      }
    }
  }
  return null;
}

/** Today's date in India, as YYYY-MM-DD. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

async function main() {
  const providerKey = process.env.RATE_PROVIDER ?? 'jewellers';
  const provider = providers[providerKey];
  if (!provider) throw new Error(`Unknown RATE_PROVIDER "${providerKey}".`);

  const file = JSON.parse(readFileSync(RATES_PATH, 'utf8')) as RatesFile;
  // Sample data is thrown away the first time a real rate arrives.
  const history = file.sample ? [] : file.history;

  const date = todayInIndia();
  const { sourceLabel, ...today } = await provider.fetchToday();
  // Compare with the most recent saved rate, including an earlier update from today.
  const previous = history.at(-1);
  const problem = validate(today, previous);
  if (problem) throw new Error(problem);

  const updated: RatesFile = {
    updatedAt: new Date().toISOString(),
    source: sourceLabel ?? provider.name,
    sample: false,
    history: upsertDay(history, { date, ...today }).slice(-MAX_DAYS),
  };
  writeFileSync(RATES_PATH, JSON.stringify(updated, null, 2) + '\n');
  console.log(`Saved rates for ${date} from ${provider.name}. ${updated.history.length} days stored.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
