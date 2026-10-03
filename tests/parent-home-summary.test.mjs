import assert from 'node:assert/strict';
import test from 'node:test';
import {
  homeWeekRange,
  summarizeHomeWeek,
} from '../lib/parent-home-summary.ts';

const range = homeWeekRange('2026-10-08');
const meal = (child_id, date, payment_status = 'paid') => ({
  child_id,
  date,
  payment_status,
});

test('home gauge uses the current Monday–Saturday week, including Sundays and year boundaries', () => {
  assert.deepEqual(range, { start: '2026-10-05', end: '2026-10-10' });
  assert.deepEqual(homeWeekRange('2026-10-11'), range);
  assert.deepEqual(homeWeekRange('2027-01-01'), {
    start: '2026-12-28',
    end: '2027-01-02',
  });
});

test('a classic meal and snack on the same day count once for that child, and once again for another child', () => {
  const result = summarizeHomeWeek(
    ['alice', 'basile'],
    [
      meal('alice', '2026-10-05'),
      meal('alice', '2026-10-05'),
      meal('basile', '2026-10-05'),
    ],
    range,
  );
  assert.equal(result.bookedMeals, 2);
  assert.equal(result.maxMeals, 12);
  assert.deepEqual(result.children.alice, {
    reservationCount: 1,
    status: 'partial',
  });
});

test('cancelled, outside-week and unrelated-child reservations never advance the gauge', () => {
  const result = summarizeHomeWeek(
    ['alice'],
    [
      meal('alice', '2026-10-05', 'cancelled'),
      meal('alice', '2026-10-04'),
      meal('alice', '2026-10-11'),
      meal('other', '2026-10-06'),
      meal('alice', '2026-10-07'),
    ],
    range,
  );
  assert.equal(result.bookedMeals, 1);
  assert.equal(result.children.alice.reservationCount, 1);
});

test('previous child-card statuses are restored: none, partial and green from five reserved days', () => {
  const result = summarizeHomeWeek(
    ['alice', 'basile', 'chloe'],
    [5, 6, 7, 8, 9]
      .map((day) => meal('alice', `2026-10-${String(day).padStart(2, '0')}`))
      .concat(meal('basile', '2026-10-05')),
    range,
  );
  assert.equal(result.children.alice.status, 'complete');
  assert.equal(result.children.basile.status, 'partial');
  assert.equal(result.children.chloe.status, 'none');
  assert.equal(result.bookedMeals, 6);
  assert.equal(result.maxMeals, 18);
});

test('empty families have a finite empty gauge; six distinct days fill the original target', () => {
  const empty = summarizeHomeWeek([], [], range);
  assert.equal(empty.bookedMeals, 0);
  assert.equal(empty.maxMeals, 0);
  assert.equal(empty.progress, 0);
  const full = summarizeHomeWeek(
    ['alice'],
    [5, 6, 7, 8, 9, 10].map((day) =>
      meal('alice', `2026-10-${String(day).padStart(2, '0')}`),
    ),
    range,
  );
  assert.equal(full.bookedMeals, 6);
  assert.equal(full.maxMeals, 6);
  assert.equal(full.progress, 1);
});
