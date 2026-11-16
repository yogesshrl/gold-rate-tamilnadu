import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBill, formatRupees, parseAmount } from './calculator.ts';

test('calculates a typical jewellery bill', () => {
  const bill = calculateBill({
    weightGrams: 8,
    ratePerGram: 12540,
    wastagePercent: 10,
    makingPerGram: 100,
    gstPercent: 3,
  });
  assert.deepEqual(bill, {
    goldValue: 100320,
    wastage: 10032,
    making: 800,
    subtotal: 111152,
    gst: 3334.56,
    total: 114486.56,
  });
});

test('works with zero wastage, making and GST', () => {
  const bill = calculateBill({
    weightGrams: 1.5,
    ratePerGram: 10000,
    wastagePercent: 0,
    makingPerGram: 0,
    gstPercent: 0,
  });
  assert.equal(bill?.total, 15000);
});

test('returns null for missing, negative or zero weight and rate', () => {
  const base = { weightGrams: 8, ratePerGram: 12540, wastagePercent: 10, makingPerGram: 0, gstPercent: 3 };
  assert.equal(calculateBill({ ...base, weightGrams: NaN }), null);
  assert.equal(calculateBill({ ...base, wastagePercent: -1 }), null);
  assert.equal(calculateBill({ ...base, weightGrams: 0 }), null);
  assert.equal(calculateBill({ ...base, ratePerGram: 0 }), null);
});

test('parses typed amounts', () => {
  assert.equal(parseAmount('12,540.50'), 12540.5);
  assert.equal(parseAmount(' 8 '), 8);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-5')));
  assert.ok(Number.isNaN(parseAmount('.')));
});

test('formats rupees with Indian grouping', () => {
  assert.equal(formatRupees(125400), '₹1,25,400');
  assert.equal(formatRupees(3334.56, 2), '₹3,334.56');
});
