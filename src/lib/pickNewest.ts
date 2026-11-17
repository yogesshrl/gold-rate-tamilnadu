import type { RatesFile } from '../types';

/**
 * Chooses the file whose latest day is most recent. On a tie the earlier file in the
 * list wins, so the primary source is preferred whenever it is as fresh as the backup.
 */
export function pickNewest(files: (RatesFile | null)[]): RatesFile | null {
  let best: RatesFile | null = null;
  let bestDate = '';
  for (const file of files) {
    const latest = file?.history[file.history.length - 1]?.date ?? '';
    if (file && latest > bestDate) {
      best = file;
      bestDate = latest;
    }
  }
  return best;
}
