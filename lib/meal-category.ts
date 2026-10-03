/** Both categories use the same menus, cart, checkout and daily quantity guards. */
export type MealCategory = 'classic' | 'snack';
export type MealCategoryFilter = 'all' | MealCategory;

export const MEAL_CATEGORIES = [
  { value: 'classic', label: 'Menus classiques', singular: 'Menu classique' },
  { value: 'snack', label: 'Snackerie', singular: 'Snackerie' },
] as const;

/** Old menus and payment snapshots predate the category field. */
export function getMealCategory(value: unknown): MealCategory {
  return value === 'snack' ? 'snack' : 'classic';
}

export function mealCategoryLabel(value: unknown): string {
  return getMealCategory(value) === 'snack' ? 'Snackerie' : 'Menu classique';
}

export function matchesMealCategory(value: unknown, filter: MealCategoryFilter): boolean {
  return filter === 'all' || getMealCategory(value) === filter;
}

export function menuContentKey(menu: {
  meal_category?: unknown; meal_name: string; date: string; price: number;
  description?: string | null; image_url?: string | null;
}): string {
  return JSON.stringify([getMealCategory(menu.meal_category), menu.meal_name, menu.date,
    Number(menu.price), menu.description || '', menu.image_url || '']);
}

export interface StudentMealCount {
  child_id: string;
  classic_count: number;
  snack_count: number;
}

export function studentHasMealCategory(count: StudentMealCount | undefined, filter: MealCategoryFilter): boolean {
  if (filter === 'all') return true;
  return Number(filter === 'snack' ? count?.snack_count : count?.classic_count) > 0;
}
