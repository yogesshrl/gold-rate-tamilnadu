import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consensus } from './consensus.ts';

const r = (source: string, value: number) => ({ source, value });

test('agrees when sources match exactly and reports the outlier', () => {
  const result = consensus([r('a', 12540), r('b', 12540), r('c', 12540), r('d', 12615)], 0.25);
  assert.equal(result?.value, 12540);
  assert.deepEqual(result?.agreed.sort(), ['a', 'b', 'c']);
  assert.deepEqual(result?.outliers, ['d']);
});

test('takes the median of readings within tolerance', () => {
  const result = consensus([r('a', 13680), r('b', 13681), r('c', 13690)], 0.25);
  assert.equal(result?.value, 13681);
  assert.deepEqual(result?.outliers, []);
});

test('returns null when no two sources agree', () => {
  assert.equal(consensus([r('a', 12000), r('b', 12540), r('c', 13100)], 0.25), null);
});

test('returns null for a single source', () => {
  assert.equal(consensus([r('a', 12540)], 0.25), null);
  assert.equal(consensus([], 0.25), null);
});

test('picks the larger group when two groups exist', () => {
  const result = consensus([r('a', 176), r('b', 190), r('c', 195)], 5);
  assert.equal(result?.value, 192.5);
  assert.deepEqual(result?.outliers, ['a']);
});
