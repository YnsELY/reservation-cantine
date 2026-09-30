// All meal-order deadlines are expressed in Morocco's civil time, independently
// of the device time zone. Older ICU/tzdata releases still predict GMT+1 after
// Morocco returned permanently to GMT on 2026-09-20 (IANA tzdb 2026c).
// Source: https://data.iana.org/time-zones/tzdb/africa
export const ORDER_TIME_ZONE = 'Africa/Casablanca';
const PERMANENT_GMT_FROM = Date.parse('2026-09-20T01:00:00Z');

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: ORDER_TIME_ZONE,
  calendar: 'iso8601',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsAt(instant: Date | number) {
  if (Number(instant) >= PERMANENT_GMT_FROM) {
    const date = new Date(instant);
    return {
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
      hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
    };
  }
  const parts = Object.fromEntries(clock.formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

export function getMoroccoDate(now: Date | number = Date.now()): string {
  const { year, month, day } = partsAt(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The absolute instant of 07:00 in Morocco on the meal's YYYY-MM-DD date. */
export function getOrderDeadlineMs(mealDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) throw new RangeError('Invalid meal date');
  const [year, month, day] = mealDate.split('-').map(Number);
  const wallTime = Date.UTC(year, month - 1, day, 7);
  if (new Date(wallTime).toISOString().slice(0, 10) !== mealDate) throw new RangeError('Invalid meal date');

  // Resolve the time-zone offset at the deadline itself, including dates on
  // which Morocco changes its clocks. 07:00 is outside the repeated/skipped hour.
  let instant = wallTime;
  for (let i = 0; i < 3; i++) {
    const p = partsAt(instant);
    const projected = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const correction = wallTime - projected;
    if (correction === 0) return instant;
    instant += correction;
  }
  throw new RangeError('Cannot resolve Morocco order deadline');
}

export function isPastOrderCutoff(mealDate: string, now: Date | number = Date.now()): boolean {
  return Number(now) >= getOrderDeadlineMs(mealDate);
}

export function getFirstBookableYmd(now: Date | number = Date.now()): string {
  const today = getMoroccoDate(now);
  if (!isPastOrderCutoff(today, now)) return today;
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
