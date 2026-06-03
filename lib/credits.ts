import { supabase, ParentCredit } from './supabase';
import { formatYmd, getWeekStart, getWeekStartYmd } from './dates';

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
  // Crédits sans deadline : disponibles tant qu'il reste un solde, quelle que soit la semaine.
  const { data, error } = await supabase
    .from('parent_credits')
    .select('*')
    .eq('parent_id', parentId)
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
  mealWeekStart: string
): Promise<number> {
  const { count, error } = await supabase
    .from('parent_credits')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId)
    .eq('meal_week_start_date', mealWeekStart);
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

/**
 * Fenêtre de validité du crédit pour une annulation.
 *
 * Règle : si l'annulation a lieu le samedi de la même semaine que le repas,
 * la semaine du repas se termine dans la journée et le crédit n'aurait plus
 * le temps d'être utilisé. On décale la validité au lundi suivant pour que
 * le parent puisse consommer le crédit la semaine d'après.
 *
 * La limite "2 annulations par semaine" reste calée sur la semaine du repas
 * (via `mealWeekStart`), pas sur la semaine de validité.
 */
export function getCreditWindow(
  mealDate: string,
  now: Date = new Date()
): { mealWeekStart: Date; usableWeekStart: Date; expiresAt: Date } {
  const mealWeekStart = getWeekStart(mealDate);
  let usableWeekStart = mealWeekStart;

  const isSameWeek = getWeekStartYmd(now) === formatYmd(mealWeekStart);
  if (now.getDay() === 6 && isSameWeek) {
    usableWeekStart = new Date(mealWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  const expiresAt = new Date(
    usableWeekStart.getFullYear(),
    usableWeekStart.getMonth(),
    usableWeekStart.getDate() + 5,
    23, 59, 59, 999
  );

  return { mealWeekStart, usableWeekStart, expiresAt };
}

export async function createCreditForCancellation(
  input: CreateCreditInput
): Promise<{ ok: boolean; error?: string }> {
  // Crédit sans deadline ni couplage semaine. On conserve meal_week_start_date
  // uniquement pour la limite MAX_CANCELLATIONS_PER_WEEK (calée sur la semaine du repas).
  const mealWeekStart = getWeekStart(input.mealDate);
  const { error } = await supabase.from('parent_credits').insert({
    parent_id: input.parentId,
    amount: input.amount,
    used_amount: 0,
    source_reservation_id: input.reservationId,
    meal_week_start_date: formatYmd(mealWeekStart),
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

  // Sans deadline ni semaine : on applique les crédits (du plus ancien au plus récent)
  // sur n'importe quel article du panier, jusqu'à épuisement.
  items.forEach(item => {
    let remainingPrice = Number(item.total_price);
    for (const credit of sortedCredits) {
      if (remainingPrice <= 0.005) break;
      if (credit._remaining <= 0.005) continue;
      const take = Math.min(credit._remaining, remainingPrice);
      credit._remaining -= take;
      remainingPrice -= take;
      usedByCredit.set(credit.id, (usedByCredit.get(credit.id) || 0) + take);
      perItemDiscount[item.id] = (perItemDiscount[item.id] || 0) + take;
    }
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
