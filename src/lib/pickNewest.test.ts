import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickNewest } from './pickNewest.ts';

const file = (source: string, ...dates: string[]) => ({
  updatedAt: '',
  source,
  sample: false,
  history: dates.map((date) => ({ date, gold22: 1, gold24: 2, silver: 3 })),
});

test('prefers the file with the most recent day', () => {
  const result = pickNewest([file('supabase', '2026-11-16'), file('github', '2026-11-16', '2026-11-17')]);
  assert.equal(result?.source, 'github');
});

test('on a tie, keeps the primary (first) source', () => {
  const result = pickNewest([file('supabase', '2026-11-17'), file('github', '2026-11-17')]);
  assert.equal(result?.source, 'supabase');
});

test('skips missing files and returns null when nothing loaded', () => {
  assert.equal(pickNewest([null, file('github', '2026-11-17')])?.source, 'github');
  assert.equal(pickNewest([null, null]), null);
});
