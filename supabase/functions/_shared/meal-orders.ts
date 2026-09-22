export interface MealOrder {
  child_id: string;
  menu_id: string;
  date: string;
  confirmed_daily_quantity?: number;
  repeat_order_confirmed_at?: string | null;
}

export const DUPLICATE_MEAL_MESSAGE =
  'Ce panier contient plusieurs repas pour le même enfant le même jour. Confirmez ce choix dans votre panier avant de payer.';
export const ALREADY_RESERVED_MESSAGE =
  'Vous avez déjà commandé pour cet enfant à cette date. Vérifiez votre panier et confirmez le repas supplémentaire avant de payer.';

export function mealOrderKey(item: MealOrder): string {
  return JSON.stringify([item.child_id, item.date]);
}

/** A confirmation only covers the daily quantity shown to the parent. */
export function dailyMealGroups<T extends MealOrder>(items: readonly T[], reservations: readonly MealOrder[]) {
  const groups = new Map<string, { items: T[]; reservedCount: number; quantity: number; approvedQuantity: number; confirmedAt: string | null }>();
  for (const item of items) {
    const key = mealOrderKey(item);
    let group = groups.get(key);
    if (!group) {
      const reservedCount = reservations.filter(r => mealOrderKey(r) === key).length;
      group = { items: [], reservedCount, quantity: reservedCount, approvedQuantity: 1, confirmedAt: null };
      groups.set(key, group);
    }
    group.items.push(item);
    group.quantity++;
    const approved = item.confirmed_daily_quantity;
    if (Number.isSafeInteger(approved) && approved! > group.approvedQuantity && item.repeat_order_confirmed_at) {
      group.approvedQuantity = approved!;
      group.confirmedAt = item.repeat_order_confirmed_at;
    }
  }
  return [...groups.values()];
}

export function unconfirmedMealGroups<T extends MealOrder>(items: readonly T[], reservations: readonly MealOrder[]) {
  return dailyMealGroups(items, reservations).filter(group => group.quantity > group.approvedQuantity);
}

/** Carry the group's recorded consent on every row in an unordered batch. */
export function withDailyConfirmations<T extends MealOrder>(items: readonly T[]): T[] {
  return dailyMealGroups(items, []).flatMap(group => group.items.map(item => ({
    ...item,
    confirmed_daily_quantity: group.approvedQuantity,
    repeat_order_confirmed_at: group.confirmedAt,
  })));
}

export function hasDuplicateMeals(items: readonly MealOrder[]): boolean {
  return new Set(items.map(mealOrderKey)).size !== items.length;
}

export function hasReservedMeal(
  items: readonly MealOrder[],
  reservations: readonly MealOrder[],
): boolean {
  const keys = new Set(reservations.map(mealOrderKey));
  return items.some(item => keys.has(mealOrderKey(item)));
}
