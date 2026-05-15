import { supabase, ParentCredit } from './supabase';
import { formatYmd, getWeekStart, getWeekEnd, getWeekStartYmd } from './dates';

export const MAX_CANCELLATIONS_PER_WEEK = 2;
export const CANCELLATION_CUTOFF_HOUR = 7;

export interface AppliedCredit {
  credit_id: string;
  amount: number;
}

export interface CartItemLike {
  id: string;
  date: string;
  total_price: number | string;
}

export interface CreditApplicationResult {
  totalDiscount: number;
  perItemDiscount: Record<string, number>;
  creditsUsed: AppliedCredit[];
}

const remaining = (c: ParentCredit) => Number(c.amount) - Number(c.used_amount);

export async function getAvailableCredits(parentId: string): Promise<ParentCredit[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('parent_credits')
    .select('*')
    .eq('parent_id', parentId)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('getAvailableCredits error:', error);
    return [];
  }
  return ((data || []) as ParentCredit[]).filter(c => remaining(c) > 0.005);
}

export async function getBalance(parentId: string): Promise<number> {
  const credits = await getAvailableCredits(parentId);
  return credits.reduce((s, c) => s + remaining(c), 0);
}

export async function countCancellationsThisWeek(
  parentId: string,
  weekStart: string
): Promise<number> {
  const { count, error } = await supabase
    .from('parent_credits')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId)
    .eq('week_start_date', weekStart);
  if (error) {
    console.error('countCancellationsThisWeek error:', error);
    return 0;
  }
  return count || 0;
}

export interface CreateCreditInput {
  parentId: string;
  reservationId: string;
  amount: number;
  mealDate: string;
}

export async function createCreditForCancellation(
  input: CreateCreditInput
): Promise<{ ok: boolean; error?: string }> {
  const weekStart = getWeekStart(input.mealDate);
  const weekEnd = getWeekEnd(input.mealDate);
  const { error } = await supabase.from('parent_credits').insert({
    parent_id: input.parentId,
    amount: input.amount,
    used_amount: 0,
    source_reservation_id: input.reservationId,
    week_start_date: formatYmd(weekStart),
    expires_at: weekEnd.toISOString(),
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function applyCreditsToCart(
  credits: ParentCredit[],
  items: CartItemLike[]
): CreditApplicationResult {
  const sortedCredits = [...credits]
    .map(c => ({ ...c, _remaining: remaining(c) }))
    .filter(c => c._remaining > 0.005)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const perItemDiscount: Record<string, number> = {};
  const usedByCredit = new Map<string, number>();

  const itemsByWeek = new Map<string, CartItemLike[]>();
  items.forEach(item => {
    const wk = getWeekStartYmd(item.date);
    const list = itemsByWeek.get(wk) || [];
    list.push(item);
    itemsByWeek.set(wk, list);
  });

  itemsByWeek.forEach((weekItems, weekKey) => {
    const weekCredits = sortedCredits.filter(c => c.week_start_date === weekKey);
    if (weekCredits.length === 0) return;

    weekItems.forEach(item => {
      let remainingPrice = Number(item.total_price);
      for (const credit of weekCredits) {
        if (remainingPrice <= 0.005) break;
        if (credit._remaining <= 0.005) continue;
        const take = Math.min(credit._remaining, remainingPrice);
        credit._remaining -= take;
        remainingPrice -= take;
        usedByCredit.set(credit.id, (usedByCredit.get(credit.id) || 0) + take);
        perItemDiscount[item.id] = (perItemDiscount[item.id] || 0) + take;
      }
    });
  });

  const creditsUsed: AppliedCredit[] = Array.from(usedByCredit.entries())
    .filter(([, amount]) => amount > 0.005)
    .map(([credit_id, amount]) => ({ credit_id, amount: round2(amount) }));

  const totalDiscount = round2(
    Object.values(perItemDiscount).reduce((s, v) => s + v, 0)
  );

  return { totalDiscount, perItemDiscount, creditsUsed };
}

export async function consumeCredits(applied: AppliedCredit[]): Promise<void> {
  if (!applied.length) return;
  const ids = applied.map(a => a.credit_id);
  const { data: rows, error } = await supabase
    .from('parent_credits')
    .select('id, used_amount')
    .in('id', ids);
  if (error) {
    console.error('consumeCredits fetch error:', error);
    return;
  }
  const currentById = new Map<string, number>((rows || []).map((r: any) => [r.id, Number(r.used_amount)]));
  await Promise.all(applied.map(async a => {
    const current = currentById.get(a.credit_id) || 0;
    const next = round2(current + a.amount);
    const { error: upErr } = await supabase
      .from('parent_credits')
      .update({ used_amount: next })
      .eq('id', a.credit_id);
    if (upErr) console.error('consumeCredits update error:', upErr);
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
