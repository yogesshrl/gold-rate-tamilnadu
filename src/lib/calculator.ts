export const GRAMS_PER_PAVAN = 8;

export type BillInput = {
  weightGrams: number;
  ratePerGram: number;
  /** Wastage / value addition, as a percentage of the gold value */
  wastagePercent: number;
  /** Making charge in rupees per gram */
  makingPerGram: number;
  /** GST percentage applied to the whole bill (3 is the usual jewellery rate) */
  gstPercent: number;
};

export type Bill = {
  goldValue: number;
  wastage: number;
  making: number;
  subtotal: number;
  gst: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const isValid = (n: number) => Number.isFinite(n) && n >= 0;

/** Returns null when any input is missing, negative or not a number. */
export function calculateBill(input: BillInput): Bill | null {
  const { weightGrams, ratePerGram, wastagePercent, makingPerGram, gstPercent } = input;
  if (![weightGrams, ratePerGram, wastagePercent, makingPerGram, gstPercent].every(isValid)) {
    return null;
  }
  if (weightGrams === 0 || ratePerGram === 0) return null;

  const goldValue = weightGrams * ratePerGram;
  const wastage = (goldValue * wastagePercent) / 100;
  const making = weightGrams * makingPerGram;
  const subtotal = goldValue + wastage + making;
  const gst = (subtotal * gstPercent) / 100;

  return {
    goldValue: round2(goldValue),
    wastage: round2(wastage),
    making: round2(making),
    subtotal: round2(subtotal),
    gst: round2(gst),
    total: round2(subtotal + gst),
  };
}

/** Parses user-typed numbers such as "12,540.50". Returns NaN for anything else. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return NaN;
  return Number(cleaned);
}

/** Formats rupees the Indian way: 1,25,400 */
export function formatRupees(amount: number, decimals = 0): string {
  return (
    '₹' +
    amount.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}
