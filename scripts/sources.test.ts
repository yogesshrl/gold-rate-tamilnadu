import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGrt, parseKhazana, parseLiveChennai, parseThangamayil, SOURCES } from './sources.ts';
import { hourInIndia, readJewellers, validate } from './update-rates.ts';

// Snippets copied from the live pages on 16 Nov 2026.
const GRT =
  '\\"gold_rate\\":[{\\"type\\":\\"GOLD\\",\\"weight\\":1,\\"unit\\":\\"G\\",\\"purity\\":\\"24 KT\\",\\"amount\\":13690,\\"sort_order\\":0},' +
  '{\\"type\\":\\"GOLD\\",\\"weight\\":1,\\"unit\\":\\"G\\",\\"purity\\":\\"22 KT\\",\\"amount\\":12540,\\"sort_order\\":1}]';
const KHAZANA =
  '<li><p class="metal">GOLD - 22KT</p> <p class="rate">₹12,540.00/gm</p></li>' +
  '<li><p class="metal">GOLD - 24KT</p> <p class="rate">₹13,681.00/gm</p></li>' +
  '<li><p class="metal">SILVER</p> <p class="rate">₹176.00/gm</p></li>';
const LIVE_CHENNAI =
  '<table><tr><td>Date</td><td>1 Gm (22 K)</td><td>Silver 1 Gm</td></tr>' +
  '<tr><td>16/Nov/2026</td><td>12,540 ( -75 )</td><td>190.00 ( -5.00 )</td></tr></table>' +
  '<table><tr><td>16/Nov/2026</td><td>13,680</td><td>109,440</td><td>12,540</td><td>100,320</td></tr></table>';
const THANGAMAYIL =
  '<!-- <span>, Last updated Time - </span><span>14/11/26 5:15 PM</span> -->' +
  '<span class="rate-spn"> GOLD RATE 22k (1gm): <span class="rate">₹12,615</span></span>' +
  '<span class="rate-spn"> GOLD RATE 24k (1gm): <span class="rate">₹13,762</span></span>' +
  '<span class="rate-spn"> SILVER RATE (1gm): <span class="rate">₹195.00</span></span>';

test('parses GRT', () => {
  assert.deepEqual(parseGrt(GRT), { gold22: 12540, gold24: 13690, silver: null, statedDate: null });
});

test('parses Khazana', () => {
  assert.deepEqual(parseKhazana(KHAZANA), { gold22: 12540, gold24: 13681, silver: 176, statedDate: null });
});

test('parses Live Chennai with its date', () => {
  assert.deepEqual(parseLiveChennai(LIVE_CHENNAI), {
    gold22: 12540,
    gold24: 13680,
    silver: 190,
    statedDate: '2026-11-16',
  });
});

test('Live Chennai rejects a row whose 8 gram price does not match', () => {
  const broken = LIVE_CHENNAI.replace('100,320', '100,999');
  assert.equal(parseLiveChennai(broken).gold22, null);
});

test('parses Thangamayil with its last-updated date', () => {
  assert.deepEqual(parseThangamayil(THANGAMAYIL), {
    gold22: 12615,
    gold24: 13762,
    silver: 195,
    statedDate: '2026-11-14',
  });
});

test('parsers return nulls for a page with no rates or absurd values', () => {
  const empty = { gold22: null, gold24: null, silver: null, statedDate: null };
  assert.deepEqual(parseGrt('<html></html>'), empty);
  assert.deepEqual(parseKhazana('<html></html>'), empty);
  assert.deepEqual(parseLiveChennai('<html></html>'), empty);
  assert.deepEqual(parseThangamayil('<html></html>'), empty);
  assert.equal(parseKhazana(KHAZANA.replace('12,540.00', '12.00')).gold22, null);
});

const pages: Record<string, string> = {
  'GRT Jewellers': GRT,
  'Khazana Jewellery': KHAZANA,
  'Live Chennai': LIVE_CHENNAI,
  Thangamayil: THANGAMAYIL,
};
const loader = (overrides: Record<string, string | null> = {}) => async (url: string) => {
  const name = SOURCES.find((s) => s.url === url)!.name;
  return name in overrides ? overrides[name] : pages[name];
};
const quiet = () => {};
// 11:00 AM and 7:30 AM India time on 16 Nov 2026.
const LATE_MORNING = new Date('2026-11-16T05:30:00Z');
const EARLY_MORNING = new Date('2026-11-16T02:00:00Z');

test('readJewellers uses the agreed rate and skips the stale source', async () => {
  const result = await readJewellers('2026-11-16', loader(), quiet, LATE_MORNING);
  assert.equal(result.gold22, 12540);
  assert.equal(result.gold24, 13681);
  // Khazana and Live Chennai disagree on silver, so the local page is used.
  assert.equal(result.silver, 190);
  assert.equal(result.sourceLabel, 'GRT Jewellers, Khazana Jewellery, Live Chennai');
});

test('readJewellers still works when one site is down', async () => {
  const result = await readJewellers('2026-11-16', loader({ 'GRT Jewellers': null }), quiet, LATE_MORNING);
  assert.equal(result.gold22, 12540);
});

test('readJewellers refuses to save when fewer than two sources agree', async () => {
  const load = loader({ 'GRT Jewellers': null, 'Khazana Jewellery': null });
  await assert.rejects(readJewellers('2026-11-16', load, quiet, LATE_MORNING), /Fewer than two sources agree/);
});

test('validate rejects impossible rates and large jumps', () => {
  const previous = { date: '2026-11-15', gold22: 12615, gold24: 13762, silver: 195 };
  assert.equal(validate({ gold22: 12540, gold24: 13681, silver: 190 }, previous), null);
  assert.match(validate({ gold22: 12540, gold24: 12000, silver: 190 }, previous)!, /24K must cost more/);
  assert.match(validate({ gold22: 20000, gold24: 21000, silver: 190 }, previous)!, /looks wrong/);
});

test('before 10 AM India time, pages without a date are not trusted', async () => {
  // Only Live Chennai states today's date, so no two sources can agree yet.
  await assert.rejects(readJewellers('2026-11-16', loader(), quiet, EARLY_MORNING), /Fewer than two sources agree/);
});

test('hourInIndia converts UTC to India time', () => {
  assert.equal(hourInIndia(new Date('2026-11-16T04:30:00Z')), 10);
  assert.equal(hourInIndia(new Date('2026-11-16T20:00:00Z')), 1);
});
