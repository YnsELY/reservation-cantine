export const formatYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseYmd = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const getWeekStart = (date: Date | string): Date => {
  const d = typeof date === 'string' ? parseYmd(date) : new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0);
};

export const getWeekEnd = (date: Date | string): Date => {
  const start = getWeekStart(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 5, 23, 59, 59, 999);
};

export const getWeekStartYmd = (date: Date | string): string => formatYmd(getWeekStart(date));

export const isSameWeek = (a: Date | string, b: Date | string): boolean =>
  getWeekStartYmd(a) === getWeekStartYmd(b);

/** Compare the meal's civil date with the catering service's cutoff in Morocco. */
export function isMealPastCutoff(date: string, now = new Date(), cutoffHour = 7): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  return date < today || (date === today && Number(part('hour')) >= cutoffHour);
}
