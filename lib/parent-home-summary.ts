import { formatYmd, getWeekStart, getWeekEnd } from './dates.ts';

export type ChildReservationStatus = 'none' | 'partial' | 'complete';
export const CHILD_RESERVATION_COLORS: Record<ChildReservationStatus, string> =
  {
    none: '#EF4444',
    partial: '#F59E0B',
    complete: '#10B981',
  };

export function homeWeekRange(today: string) {
  return {
    start: formatYmd(getWeekStart(today)),
    end: formatYmd(getWeekEnd(today)),
  };
}

/** Restore the original Monday–Saturday gauge: one reserved day per child,
 * even when the same day has both a classic meal and a snack. */
export function summarizeHomeWeek(
  childIds: readonly string[],
  reservations: readonly {
    child_id: string;
    date: string;
    payment_status?: string | null;
  }[],
  range: { start: string; end: string },
) {
  const datesByChild = new Map(
    [...new Set(childIds)].map((id) => [id, new Set<string>()]),
  );
  for (const reservation of reservations) {
    if (
      reservation.payment_status === 'cancelled' ||
      reservation.date < range.start ||
      reservation.date > range.end
    )
      continue;
    datesByChild.get(reservation.child_id)?.add(reservation.date);
  }
  const children = Object.fromEntries(
    [...datesByChild].map(([id, dates]) => [
      id,
      {
        reservationCount: dates.size,
        // Same child-card thresholds as the previous home screen.
        status: (dates.size === 0
          ? 'none'
          : dates.size >= 5
            ? 'complete'
            : 'partial') as ChildReservationStatus,
      },
    ]),
  );
  const bookedMeals = [...datesByChild.values()].reduce(
    (sum, dates) => sum + dates.size,
    0,
  );
  const maxMeals = datesByChild.size * 6;
  return {
    children,
    bookedMeals,
    maxMeals,
    progress: maxMeals > 0 ? Math.min(1, bookedMeals / maxMeals) : 0,
  };
}
