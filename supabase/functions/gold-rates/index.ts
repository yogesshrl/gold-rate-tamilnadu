// Supabase Edge Function: reads Tamil Nadu jeweller rate pages, keeps the rate that at
// least two pages agree on, and saves the full history as a public JSON file in Storage.
// pg_cron calls it after each Madras jewellers' association publication (9:30 AM, 3:30 PM).
//
// This file is self-contained so it can be pasted into the Supabase dashboard editor.
// The parsing and agreement rules mirror scripts/sources.ts and src/lib/consensus.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'gold-rates';
const RATES_FILE = 'rates.json';
const ATTEMPT_FILE = 'last-attempt.json';
/** Used once to start the history if the Storage file does not exist yet. */
const SEED_URL = 'https://raw.githubusercontent.com/yogesshrl/gold-rate-tamilnadu/main/data/rates.json';
/** Anyone can call a public function, so real work happens at most once in this window. */
const COOLDOWN_MINUTES = 10;
const MAX_DAYS = 365 * 3;
const MAX_DAILY_MOVE_PERCENT = 10;
const GOLD_TOLERANCE_PERCENT = 0.25;
const SILVER_TOLERANCE_PERCENT = 5;
const SILVER_FALLBACK_SOURCE = 'Live Chennai';
/** Pages without a printed date can still show yesterday's rate before this hour (India time). */
const UNDATED_FROM_HOUR = 10;

type DayRate = { date: string; gold22: number; gold24: number; silver: number };
type RatesFile = { updatedAt: string; source: string; sample: boolean; history: DayRate[] };
type Reading = { gold22: number | null; gold24: number | null; silver: number | null; statedDate: string | null };

// ---------- parsing ----------

const inRange = (text: string | undefined, min: number, max: number) => {
  if (!text) return null;
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};
const gold = (t?: string) => inRange(t, 3000, 60000);
const silver = (t?: string) => inRange(t, 30, 1000);
const pad = (n: number | string) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function visibleText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

function parseGrt(html: string): Reading {
  const amount = (purity: string) =>
    html.match(new RegExp(`purity\\\\?":\\\\?"${purity}\\\\?",\\\\?"amount\\\\?":([\\d.]+)`))?.[1];
  return { gold22: gold(amount('22 KT')), gold24: gold(amount('24 KT')), silver: null, statedDate: null };
}

function parseKhazana(html: string): Reading {
  const rate = (label: string) =>
    html.match(new RegExp(`${label}\\s*</p>\\s*<p class="rate">\\s*₹\\s*([\\d,.]+)`, 'i'))?.[1];
  return { gold22: gold(rate('GOLD - 22KT')), gold24: gold(rate('GOLD - 24KT')), silver: silver(rate('SILVER')), statedDate: null };
}

function parseLiveChennai(html: string): Reading {
  const text = visibleText(html);
  const row = text.match(/(\d{1,2})\/([A-Za-z]{3})\/(\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
  const silverMatch = text.match(/Silver 1 Gm\s+\d{1,2}\/[A-Za-z]{3}\/\d{4}\s+[\d,]+\s*\([^)]*\)\s*([\d,.]+)/);
  let gold22: number | null = null;
  let gold24: number | null = null;
  let statedDate: string | null = null;
  if (row) {
    const month = MONTHS.indexOf(row[2].toLowerCase());
    if (month >= 0) statedDate = `${row[3]}-${pad(month + 1)}-${pad(row[1])}`;
    const g24 = gold(row[4]);
    const g22 = gold(row[6]);
    // The 8 gram columns must be exactly 8 x the 1 gram columns, or the row was misread.
    if (g24 && Number(row[5].replace(/,/g, '')) === g24 * 8) gold24 = g24;
    if (g22 && Number(row[7].replace(/,/g, '')) === g22 * 8) gold22 = g22;
  }
  return { gold22, gold24, silver: silver(silverMatch?.[1]), statedDate };
}

function parseThangamayil(html: string): Reading {
  const text = visibleText(html);
  const rate = (label: string) => text.match(new RegExp(`${label}\\s*\\(1gm\\)\\s*[:-]?\\s*₹\\s*([\\d,.]+)`, 'i'))?.[1];
  const updated = html.match(/updated Time\s*-?\s*(?:<[^>]+>\s*)*(\d{1,2})\/(\d{1,2})\/(\d{2})\b/i);
  return {
    gold22: gold(rate('GOLD RATE 22k')),
    gold24: gold(rate('GOLD RATE 24k')),
    silver: silver(rate('SILVER RATE')),
    statedDate: updated ? `20${updated[3]}-${pad(updated[2])}-${pad(updated[1])}` : null,
  };
}

const SOURCES = [
  { name: 'GRT Jewellers', url: 'https://www.grtjewels.com/', parse: parseGrt },
  { name: 'Khazana Jewellery', url: 'https://www.khazanajewellery.com/', parse: parseKhazana },
  { name: 'Live Chennai', url: 'https://www.livechennai.com/gold_silverrate.asp', parse: parseLiveChennai },
  { name: 'Thangamayil', url: 'https://www.thangamayil.com/', parse: parseThangamayil },
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// ---------- agreement and checks ----------

type Value = { source: string; value: number };

/** Median of the largest group of readings within tolerance; null unless two or more agree. */
function consensus(values: Value[], tolerancePercent: number) {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  let best: Value[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const limit = sorted[i].value * (1 + tolerancePercent / 100);
    const group = sorted.slice(i).filter((v) => v.value <= limit);
    if (group.length > best.length) best = group;
  }
  if (best.length < 2) return null;
  const nums = best.map((v) => v.value);
  const mid = Math.floor(nums.length / 2);
  const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  return { value: Math.round(median * 100) / 100, agreed: best.map((v) => v.source) };
}

function validate(today: Omit<DayRate, 'date'>, previous?: DayRate): string | null {
  for (const key of ['gold22', 'gold24', 'silver'] as const) {
    if (!Number.isFinite(today[key]) || today[key] <= 0) return `${key} must be a positive number.`;
  }
  if (today.gold24 <= today.gold22) return '24K must cost more than 22K.';
  if (previous) {
    for (const key of ['gold22', 'gold24', 'silver'] as const) {
      const move = (Math.abs(today[key] - previous[key]) / previous[key]) * 100;
      if (move > MAX_DAILY_MOVE_PERCENT) return `${key} moved ${move.toFixed(1)}% in one update, which looks wrong.`;
    }
  }
  return null;
}

const indiaDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const indiaHour = (d: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(d));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * The server key Supabase injects into every Edge Function: the legacy service-role key,
 * or one of the newer secret keys (a JSON map of name to key). It never leaves the function.
 */
function serverKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const keys = JSON.parse(raw);
    const first = typeof keys === 'string' ? keys : Object.values(keys)[0];
    if (typeof first === 'string' && first) return first;
  } catch {
    if (raw) return raw;
  }
  throw new Error('No server key available to write to Storage.');
}

// ---------- handler ----------

Deno.serve(async () => {
  const now = new Date();
  const today = indiaDate(now);
  const log: string[] = [];
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serverKey());
  const storage = supabase.storage.from(BUCKET);

  // Cooldown, so repeated calls cannot hammer the jeweller sites.
  const { data: attemptBlob } = await storage.download(ATTEMPT_FILE);
  if (attemptBlob) {
    try {
      const last = new Date(JSON.parse(await attemptBlob.text()).at);
      if (now.getTime() - last.getTime() < COOLDOWN_MINUTES * 60_000) {
        return json({ status: 'skipped', reason: `Ran less than ${COOLDOWN_MINUTES} minutes ago.` });
      }
    } catch { /* unreadable marker: carry on */ }
  }
  await storage.upload(ATTEMPT_FILE, JSON.stringify({ at: now.toISOString() }), {
    upsert: true,
    contentType: 'application/json',
  });

  // Existing history: from Storage, or seeded once from the GitHub copy.
  let history: DayRate[] = [];
  const { data: ratesBlob } = await storage.download(RATES_FILE);
  try {
    const file: RatesFile = ratesBlob
      ? JSON.parse(await ratesBlob.text())
      : await (await fetch(SEED_URL, { signal: AbortSignal.timeout(15000) })).json();
    history = file.sample ? [] : file.history;
    if (!ratesBlob) log.push(`Seeded ${history.length} days from GitHub.`);
  } catch {
    log.push('No existing history found; starting fresh.');
  }

  // Read every source.
  const undatedAllowed = indiaHour(now) >= UNDATED_FROM_HOUR;
  const readings: { name: string; reading: Reading }[] = [];
  const pages = await Promise.all(SOURCES.map((s) => fetchPage(s.url)));
  SOURCES.forEach((source, i) => {
    const html = pages[i];
    if (!html) return log.push(`${source.name}: could not load the page.`);
    const reading = source.parse(html);
    if (reading.statedDate && reading.statedDate !== today) {
      return log.push(`${source.name}: dated ${reading.statedDate}, not today. Skipped.`);
    }
    if (!reading.statedDate && !undatedAllowed) {
      return log.push(`${source.name}: no date on page and it is before ${UNDATED_FROM_HOUR} AM. Skipped.`);
    }
    log.push(`${source.name}: 22K ${reading.gold22 ?? '-'}, 24K ${reading.gold24 ?? '-'}, silver ${reading.silver ?? '-'}`);
    readings.push({ name: source.name, reading });
  });

  const values = (metal: 'gold22' | 'gold24' | 'silver') =>
    readings.flatMap(({ name, reading }) => (reading[metal] === null ? [] : [{ source: name, value: reading[metal]! }]));

  const g22 = consensus(values('gold22'), GOLD_TOLERANCE_PERCENT);
  const g24 = consensus(values('gold24'), GOLD_TOLERANCE_PERCENT);
  if (!g22 || !g24) {
    log.push('Fewer than two sources agree on gold. Nothing saved; the next run will try again.');
    console.log(log.join('\n'));
    return json({ status: 'waiting', today, log });
  }
  const silverAgreed = consensus(values('silver'), SILVER_TOLERANCE_PERCENT);
  const silverValue =
    silverAgreed?.value ?? readings.find((r) => r.name === SILVER_FALLBACK_SOURCE)?.reading.silver ?? history.at(-1)?.silver ?? null;
  if (silverValue === null) {
    log.push('No silver rate available. Nothing saved.');
    console.log(log.join('\n'));
    return json({ status: 'waiting', today, log });
  }

  const rate = { gold22: g22.value, gold24: g24.value, silver: silverValue };
  const problem = validate(rate, history.at(-1));
  if (problem) {
    log.push(`${problem} Not saved.`);
    console.error(log.join('\n'));
    return json({ status: 'rejected', today, log }, 422);
  }

  const updated: RatesFile = {
    updatedAt: now.toISOString(),
    source: g22.agreed.join(', '),
    sample: false,
    history: [...history.filter((d) => d.date !== today), { date: today, ...rate }]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_DAYS),
  };
  const { error } = await storage.upload(RATES_FILE, JSON.stringify(updated, null, 2), {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '300',
  });
  if (error) {
    log.push(`Could not save: ${error.message}`);
    console.error(log.join('\n'));
    return json({ status: 'error', today, log }, 500);
  }
  log.push(`Saved ${today}: 22K ${rate.gold22}, 24K ${rate.gold24}, silver ${rate.silver}. ${updated.history.length} days stored.`);
  console.log(log.join('\n'));
  return json({ status: 'saved', today, rate, log });
});
