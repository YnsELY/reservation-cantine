import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { getMoroccoDate, getOrderDeadlineMs, getFirstBookableYmd, isPastOrderCutoff } from '../lib/order-time.ts';

test('September 29: orders remain open until exactly 07:00 in Morocco', () => {
  assert.equal(new Date(getOrderDeadlineMs('2026-09-29')).toISOString(), '2026-09-29T07:00:00.000Z');
  assert.equal(isPastOrderCutoff('2026-09-29', new Date('2026-09-29T06:49:38Z')), false);
  assert.equal(getOrderDeadlineMs('2026-09-29') - Date.parse('2026-09-29T06:50:01Z'), 599_000);
  assert.equal(isPastOrderCutoff('2026-09-29', new Date('2026-09-29T06:59:59.999Z')), false);
  assert.equal(isPastOrderCutoff('2026-09-29', new Date('2026-09-29T07:00:00Z')), true);
});

test('Morocco date and next available day are independent of UTC midnight', () => {
  assert.equal(getMoroccoDate(new Date('2026-09-18T23:30:00Z')), '2026-09-19');
  assert.equal(getMoroccoDate(new Date('2026-09-28T23:30:00Z')), '2026-09-28');
  assert.equal(getFirstBookableYmd(new Date('2026-09-29T06:59:59Z')), '2026-09-29');
  assert.equal(getFirstBookableYmd(new Date('2026-09-29T07:00:00Z')), '2026-09-30');
  assert.equal(getFirstBookableYmd(new Date('2026-12-31T12:00:00Z')), '2027-01-01');
});

test('deadlines follow Morocco clock changes, including Ramadan', () => {
  const deadlines = {
    '2026-02-14': '2026-02-14T06:00:00.000Z',
    '2026-02-15': '2026-02-15T07:00:00.000Z',
    '2026-02-20': '2026-02-20T07:00:00.000Z',
    '2026-03-21': '2026-03-21T07:00:00.000Z',
    '2026-03-22': '2026-03-22T06:00:00.000Z',
    '2026-09-19': '2026-09-19T06:00:00.000Z',
    '2026-09-20': '2026-09-20T07:00:00.000Z',
    '2027-01-10': '2027-01-10T07:00:00.000Z',
    '2027-06-10': '2027-06-10T07:00:00.000Z',
  };
  for (const [date, deadline] of Object.entries(deadlines)) {
    assert.equal(new Date(getOrderDeadlineMs(date)).toISOString(), deadline);
  }
});

test('the same instant produces the same deadline in different device time zones', () => {
  const moduleUrl = new URL('../lib/order-time.ts', import.meta.url).href;
  const script = `import { getOrderDeadlineMs, getFirstBookableYmd, getMoroccoDate } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify([getOrderDeadlineMs('2026-09-29'), getFirstBookableYmd(new Date('2026-09-29T06:50:00Z')), getMoroccoDate(new Date('2026-09-28T23:30:00Z'))]));`;
  const outputs = ['Africa/Casablanca', 'UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim()
  );
  assert.equal(new Set(outputs).size, 1);
});

test('invalid meal dates cannot silently select a different deadline', () => {
  for (const date of ['', '2026-02-30', '2026-13-01', '29/09/2026']) {
    assert.throws(() => getOrderDeadlineMs(date), RangeError);
  }
});
