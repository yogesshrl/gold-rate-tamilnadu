import AsyncStorage from '@react-native-async-storage/async-storage';
import bundled from '../../data/rates.json';
import type { DayRate, RatesFile } from '../types';

/**
 * Where the app downloads the latest rates from. Leave empty until the rates file is hosted;
 * the app then shows the copy bundled at build time.
 */
export const RATES_URL = '';

const CACHE_KEY = 'rates-file-v1';
const FETCH_TIMEOUT_MS = 8000;

export type LoadedRates = { file: RatesFile; origin: 'network' | 'cache' | 'bundled' };

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function isDayRate(value: unknown): value is DayRate {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
    isPositive(d.gold22) &&
    isPositive(d.gold24) &&
    isPositive(d.silver)
  );
}

/** Returns the file only if it has the expected shape and at least one day. */
export function parseRatesFile(value: unknown): RatesFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const f = value as Record<string, unknown>;
  if (typeof f.updatedAt !== 'string' || typeof f.source !== 'string') return null;
  if (!Array.isArray(f.history) || f.history.length === 0 || !f.history.every(isDayRate)) return null;
  return {
    updatedAt: f.updatedAt,
    source: f.source,
    sample: f.sample === true,
    history: f.history,
  };
}

async function fetchRemote(): Promise<RatesFile | null> {
  if (!RATES_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RATES_URL, { signal: controller.signal });
    if (!response.ok) return null;
    return parseRatesFile(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(): Promise<RatesFile | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? parseRatesFile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Newest available rates: network first, then the last saved copy, then the bundled file. */
export async function loadRates(): Promise<LoadedRates> {
  const remote = await fetchRemote();
  if (remote) {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote)).catch(() => {});
    return { file: remote, origin: 'network' };
  }
  const cached = await readCache();
  if (cached) return { file: cached, origin: 'cache' };

  const fallback = parseRatesFile(bundled);
  if (!fallback) throw new Error('Bundled rates file is invalid.');
  return { file: fallback, origin: 'bundled' };
}
