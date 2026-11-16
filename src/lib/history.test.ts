import assert from 'node:assert/strict';
import { test } from 'node:test';
import { change, changeSinceYesterday, lastDays, lookback, upsertDay } from './history.ts';

const history = [
  { date: '2026-11-01', gold22: 12000, gold24: 13090, silver: 170 },
  { date: '2026-11-02', gold22: 12100, gold24: 13200, silver: 171 },
  { date: '2026-11-05', gold22: 12300, gold24: 13420, silver: 175 },
  { date: '2026-11-10', gold22: 12600, gold24: 13745, silver: 172 },
];

test('change reports amount, percent and direction', () => {
  assert.deepEqual(change(100, 110), { amount: 10, percent: 10, direction: 'up' });
  assert.deepEqual(change(200, 190), { amount: -10, percent: -5, direction: 'down' });
  assert.deepEqual(change(50, 50), { amount: 0, percent: 0, direction: 'same' });
});

test('changeSinceYesterday compares the last two days', () => {
  assert.equal(changeSinceYesterday(history, 'gold22')?.amount, 300);
  assert.equal(changeSinceYesterday(history, 'silver')?.direction, 'down');
  assert.equal(changeSinceYesterday(history.slice(0, 1), 'gold22'), null);
});

test('lastDays returns the newest entries, oldest first', () => {
  assert.deepEqual(lastDays(history, 2).map((d) => d.date), ['2026-11-05', '2026-11-10']);
  assert.equal(lastDays(history, 99).length, 4);
});

test('lookback uses the closest recorded day on or before the target', () => {
  // 7 days before 10 Nov is 3 Nov; the closest earlier record is 2 Nov.
  const result = lookback(history, 'gold22', 8, 7);
  assert.equal(result?.boughtOn, '2026-11-02');
  assert.equal(result?.thenValue, 96800);
  assert.equal(result?.nowValue, 100800);
  assert.equal(result?.change.amount, 4000);
});

test('lookback returns null when history does not go back far enough', () => {
  assert.equal(lookback(history, 'gold22', 8, 30), null);
});

test('upsertDay replaces an existing date and keeps order', () => {
  const updated = upsertDay(history, { date: '2026-11-05', gold22: 1, gold24: 2, silver: 3 });
  assert.equal(updated.length, 4);
  assert.equal(updated[2].gold22, 1);
  const added = upsertDay(history, { date: '2026-11-03', gold22: 1, gold24: 2, silver: 3 });
  assert.deepEqual(added.map((d) => d.date), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-10']);
});
