/**
 * Readers for public rate pages. Each parser takes the page HTML and returns whatever
 * rates it can find, in rupees per gram. A parser returns null for a rate it cannot
 * find or that looks implausible, and never guesses.
 */

export type SourceReading = {
  gold22: number | null;
  gold24: number | null;
  silver: number | null;
  /** YYYY-MM-DD the page says its rate is for, when the page states one */
  statedDate: string | null;
};

export type Source = {
  name: string;
  url: string;
  parse: (html: string) => SourceReading;
};

const GOLD_RANGE = [3000, 60000] as const;
const SILVER_RANGE = [30, 1000] as const;

function toNumber(text: string | undefined, [min, max]: readonly [number, number]): number | null {
  if (!text) return null;
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

const gold = (text: string | undefined) => toNumber(text, GOLD_RANGE);
const silver = (text: string | undefined) => toNumber(text, SILVER_RANGE);

/** Removes scripts, styles, comments and tags, leaving the visible text. */
export function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');

export function parseGrt(html: string): SourceReading {
  // Rates are embedded as JSON, sometimes with escaped quotes: \"purity\":\"22 KT\",\"amount\":12540
  const amount = (purity: string) =>
    html.match(new RegExp(`purity\\\\?":\\\\?"${purity}\\\\?",\\\\?"amount\\\\?":([\\d.]+)`))?.[1];
  return { gold22: gold(amount('22 KT')), gold24: gold(amount('24 KT')), silver: null, statedDate: null };
}

export function parseKhazana(html: string): SourceReading {
  const rate = (label: string) =>
    html.match(new RegExp(`${label}\\s*</p>\\s*<p class="rate">\\s*₹\\s*([\\d,.]+)`, 'i'))?.[1];
  return {
    gold22: gold(rate('GOLD - 22KT')),
    gold24: gold(rate('GOLD - 24KT')),
    silver: silver(rate('SILVER')),
    statedDate: null,
  };
}

export function parseLiveChennai(html: string): SourceReading {
  const text = visibleText(html);
  // Row: date, 24K 1g, 24K 8g, 22K 1g, 22K 8g
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
    const g24x8 = Number(row[5].replace(/,/g, ''));
    const g22x8 = Number(row[7].replace(/,/g, ''));
    // The 8 gram columns must equal 8 x the 1 gram columns, or the row was misread.
    if (g24 && g24x8 === g24 * 8) gold24 = g24;
    if (g22 && g22x8 === g22 * 8) gold22 = g22;
  }
  return { gold22, gold24, silver: silver(silverMatch?.[1]), statedDate };
}

export function parseThangamayil(html: string): SourceReading {
  const text = visibleText(html);
  const rate = (label: string) => text.match(new RegExp(`${label}\\s*\\(1gm\\)\\s*[:-]?\\s*₹\\s*([\\d,.]+)`, 'i'))?.[1];
  // "Last updated Time - 14/11/26 5:15 PM" appears in a comment, so read it from the raw HTML.
  const updated = html.match(/updated Time\s*-?\s*(?:<[^>]+>\s*)*(\d{1,2})\/(\d{1,2})\/(\d{2})\b/i);
  return {
    gold22: gold(rate('GOLD RATE 22k')),
    gold24: gold(rate('GOLD RATE 24k')),
    silver: silver(rate('SILVER RATE')),
    statedDate: updated ? `20${updated[3]}-${pad(updated[2])}-${pad(updated[1])}` : null,
  };
}

export const SOURCES: Source[] = [
  { name: 'GRT Jewellers', url: 'https://www.grtjewels.com/', parse: parseGrt },
  { name: 'Khazana Jewellery', url: 'https://www.khazanajewellery.com/', parse: parseKhazana },
  { name: 'Live Chennai', url: 'https://www.livechennai.com/gold_silverrate.asp', parse: parseLiveChennai },
  { name: 'Thangamayil', url: 'https://www.thangamayil.com/', parse: parseThangamayil },
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Fetches one page. Returns null on any network or HTTP failure. */
export async function fetchPage(url: string, timeoutMs = 25000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
