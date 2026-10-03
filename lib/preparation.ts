import { matchesMealCategory, type MealCategory, type MealCategoryFilter } from './meal-category.ts';
import { parseOrderSupplements } from './order-supplements.ts';
import type { OrderSupplement } from './order-supplements.ts';

export interface PreparationOrder {
  meal_name?: string;
  meal_category?: MealCategory;
  id: string;
  child_name: string;
  child_initial: string;
  parent_name: string;
  school_id: string;
  school_name: string;
  grade: string | null;
  genre: string | null;
  allergies: string[];
  dietary_restrictions: string[];
  supplements: OrderSupplement[];
  annotations: string | null;
}

export interface PreparationSnapshot {
  generatedAt: string;
  orders: PreparationOrder[];
}

type PreparationClient = {
  rpc: (name: string, args: { p_menu_ids: string[]; p_date: string }) => PromiseLike<{ data: any; error: any }>;
};

export async function fetchPreparationSnapshot(client: PreparationClient, menuIds: string[], date: string): Promise<PreparationSnapshot> {
  if (!menuIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Sélection de repas invalide.');
  const { data, error } = await client.rpc('get_preparation_snapshot', { p_menu_ids: menuIds, p_date: date });
  if (error) throw new Error('Impossible d’actualiser les réservations. Réessayez avant d’exporter.');
  if (!data || !Array.isArray(data.orders) || !Number.isFinite(Date.parse(data.generated_at))) {
    throw new Error('La liste reçue est incomplète. Réessayez avant d’exporter.');
  }
  const seen = new Set<string>();
  const orders = data.orders.map((row: any): PreparationOrder => {
    // Do not turn an unreadable child into an anonymous meal without allergies.
    if (!row.id || seen.has(row.id) || !row.child_id || !row.child_name || !row.school_id || !row.school_name ||
        !Array.isArray(row.allergies) || !Array.isArray(row.dietary_restrictions)) {
      throw new Error('Certaines informations élève ou école sont inaccessibles. La fiche ne peut pas être exportée.');
    }
    seen.add(row.id);
    return {
      ...row,
      child_initial: row.child_name.charAt(0).toUpperCase(),
      parent_name: row.parent_name || 'Parent non renseigné',
      supplements: parseOrderSupplements(row.supplements),
      annotations: row.annotations?.trim() || null,
    };
  });
  return { generatedAt: data.generated_at, orders };
}

export function selectPreparationOrders(orders: PreparationOrder[], schoolId: string, genre: string, category: MealCategoryFilter = 'all') {
  return orders.filter(order => (schoolId === 'all' || order.school_id === schoolId) &&
    (genre === 'all' || order.genre === genre) && matchesMealCategory(order.meal_category, category));
}
