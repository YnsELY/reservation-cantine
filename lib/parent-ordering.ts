import { getMealCategory, type MealCategory } from './meal-category';

/** Every transition carries the same child and service date. */
export function orderingRoute({
  childId = '',
  date = '',
  category = 'classic',
  selectChild = false,
}: {
  childId?: string;
  date?: string;
  category?: MealCategory;
  selectChild?: boolean;
} = {}) {
  return {
    pathname: '/(parent)/reservation' as const,
    params: {
      childId: selectChild ? '' : childId,
      date,
      category: getMealCategory(category),
      selectChild: selectChild ? String(Date.now()) : '',
    },
  };
}
export function childDayKey(item: { child_id: string; date: string }) {
  return `${item.child_id}:${item.date}`;
}

/** Existing carts contain either a legacy array or the current { items } shape. */
export function cartSupplementItems(
  value: unknown,
): { name: string; price: number }[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'items' in value
      ? value.items
      : [];
  return Array.isArray(items)
    ? items
        .filter((item) => item && typeof item.name === 'string')
        .map((item) => ({ name: item.name, price: Number(item.price) || 0 }))
    : [];
}
