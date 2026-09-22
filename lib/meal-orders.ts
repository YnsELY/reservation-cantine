import { supabase } from './supabase';
import { showAlert } from './alert';
import {
  MealOrder,
  unconfirmedMealGroups,
  withDailyConfirmations,
} from '../supabase/functions/_shared/meal-orders';

export type RepeatOrderChoice = 'confirm' | 'other-child' | 'cancel';

export function childSelectionRoute(date: string) {
  return {
    pathname: '/(parent)/reservation' as const,
    params: { childId: '', selectChild: String(Date.now()), date },
  };
}

export async function getActiveMeals(items: readonly MealOrder[]): Promise<MealOrder[]> {
  if (!items.length) return [];
  const { data, error } = await supabase.from('reservations')
    .select('child_id, menu_id, date')
    .in('child_id', [...new Set(items.map(item => item.child_id))])
    .in('date', [...new Set(items.map(item => item.date))])
    .or('payment_status.is.null,payment_status.neq.cancelled');
  if (error) throw error;
  return data || [];
}

export async function hasAnotherChild(parentId: string, childId: string): Promise<boolean> {
  const { data, error } = await supabase.from('children').select('id')
    .eq('parent_id', parentId).neq('id', childId).limit(1);
  if (error) throw error;
  return !!data?.length;
}

export function confirmRepeatOrder(options: {
  childName: string;
  date: string;
  reservedCount: number;
  cartCount: number;
  quantity: number;
  amount: number;
  hasSibling: boolean;
  adding?: boolean;
}): Promise<RepeatOrderChoice> {
  const { childName, reservedCount, cartCount, quantity, amount, hasSibling, adding } = options;
  const day = new Date(`${options.date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const existing = reservedCount > 0
    ? `Attention, vous avez déjà commandé ${reservedCount} repas pour ${childName} le ${day}.`
    : `Attention, votre panier contient déjà ${cartCount} repas pour ${childName} le ${day}.`;
  const cost = adding
    ? `Le repas ajouté sera facturé ${amount.toFixed(2)} DH.`
    : `Les ${cartCount} repas de ce panier pour cet enfant et cette date seront facturés ${amount.toFixed(2)} DH au total, avant utilisation éventuelle de votre cagnotte.`;
  const message = `${existing}\n\nEn poursuivant, vous aurez ${quantity} repas pour le même enfant ce jour-là. ${cost}`
    + (hasSibling ? '\n\nSouhaitiez-vous plutôt commander pour un autre enfant ?' : '');
  return new Promise(resolve => {
    showAlert('Déjà commandé pour cet enfant', message, [
      ...(hasSibling ? [{ text: 'Choisir un autre enfant', onPress: () => resolve('other-child') }] : []),
      { text: 'Annuler', style: 'cancel', onPress: () => resolve('cancel') },
      { text: adding ? 'Confirmer le repas en plus' : 'Confirmer ces repas', onPress: () => resolve('confirm') },
    ], { requireExplicitChoice: true });
  });
}

interface CartMeal extends MealOrder {
  id: string;
  total_price: number;
  child: { first_name: string; last_name: string };
}

/** Re-read the cart and reservations: a second device may have placed an order. */
export async function prepareCartOrders<T extends CartMeal>(
  items: readonly T[],
  parentId: string,
  chooseAnotherChild: (date: string) => void,
): Promise<T[] | null> {
  if (!items.length) return [];
  const { data: stored, error } = await supabase.from('cart_items').select('*')
    .eq('parent_id', parentId).in('id', items.map(item => item.id));
  if (error) throw error;
  const liveItems = items.map(item => {
    const live = stored?.find(row => row.id === item.id);
    if (!live || live.child_id !== item.child_id || live.menu_id !== item.menu_id || live.date !== item.date ||
        Number(live.total_price) !== Number(item.total_price)) {
      throw new Error('Votre panier a changé. Revenez au panier pour le vérifier avant de payer.');
    }
    return { ...item, confirmed_daily_quantity: live.confirmed_daily_quantity, repeat_order_confirmed_at: live.repeat_order_confirmed_at };
  });
  // A completed credit order may still be visible if removing its cart failed.
  const { data: purchased, error: purchasedError } = await supabase.from('reservations')
    .select('source_cart_item_id').in('source_cart_item_id', items.map(item => item.id)).limit(1);
  if (purchasedError) throw purchasedError;
  if (purchased?.length) throw new Error('Cette commande a déjà été enregistrée. Consultez vos commandes avant de continuer.');
  const reservations = await getActiveMeals(liveItems);
  for (const group of unconfirmedMealGroups(liveItems, reservations)) {
    const first = group.items[0];
    const choice = await confirmRepeatOrder({
      childName: `${first.child.first_name} ${first.child.last_name}`,
      date: first.date,
      reservedCount: group.reservedCount,
      cartCount: group.items.length,
      quantity: group.quantity,
      amount: group.items.reduce((sum, item) => sum + Number(item.total_price), 0),
      hasSibling: await hasAnotherChild(parentId, first.child_id),
    });
    if (choice === 'other-child') chooseAnotherChild(first.date);
    if (choice !== 'confirm') return null;
    const { data: updated, error: updateError } = await supabase.from('cart_items')
      .update({ confirmed_daily_quantity: group.quantity })
      .eq('parent_id', parentId).in('id', group.items.map(item => item.id))
      .select('id, confirmed_daily_quantity, repeat_order_confirmed_at');
    if (updateError) throw updateError;
    if (updated?.length !== group.items.length) throw new Error('Votre panier a changé. Veuillez le vérifier.');
    for (const item of group.items) {
      const saved = updated.find(row => row.id === item.id)!;
      item.confirmed_daily_quantity = saved.confirmed_daily_quantity;
      item.repeat_order_confirmed_at = saved.repeat_order_confirmed_at;
    }
  }
  return withDailyConfirmations(liveItems);
}
