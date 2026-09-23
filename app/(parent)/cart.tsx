import { isMealPastCutoff } from '@/lib/dates';
import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Switch } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase, CartItem, Child, Menu, Parent, ParentCredit } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { payzoneService, CartItemForPayment, PendingPayment } from '@/lib/payzone';
import { getPaymentErrorMessage } from '@/lib/payment-errors';
import { childSelectionRoute, prepareCartOrders } from '@/lib/meal-orders';
import { applyCreditsToCart, getAvailableCredits } from '@/lib/credits';
import { ArrowLeft, Trash2, ShoppingCart, Lock, User, Wallet, Check } from 'lucide-react-native';

interface CartItemWithDetails extends CartItem {
  child: Child;
  menu: Menu;
}

export default function CartScreen() {
  const [openPayments, setOpenPayments] = useState<PendingPayment[]>([]);
  const [checkingOrder, setCheckingOrder] = useState<string | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [cartItems, setCartItems] = useState<CartItemWithDetails[]>([]);
  const [credits, setCredits] = useState<ParentCredit[]>([]);
  const [useCredits, setUseCredits] = useState(true);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const processingPaymentRef = useRef(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      processingPaymentRef.current = false;
      setProcessingPayment(false);
      loadCartData();
    }, [])
  );

  const isPastCutoff = isMealPastCutoff;

  const loadCartData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }

      setParent(currentParent);

      const { data: pendingRows, error: pendingError } = await supabase.from('pending_payments')
        .select('*').eq('parent_id', currentParent.id).is('released_at', null)
        .in('status', ['pending', 'failed', 'expired']).order('created_at', { ascending: false });
      if (pendingError) throw pendingError;
      const pending = (pendingRows || []) as PendingPayment[];
      setOpenPayments(pending);
      const lockedItems = new Set(pending.flatMap(payment => payment.cart_items.map(item => item.id)));

      const { data: items, error } = await supabase
        .from('cart_items')
        .select('*')
        .eq('parent_id', currentParent.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (items && items.length > 0) {
        const itemsWithDetails = await Promise.all(
          items.map(async (item) => {
            const [childData, menuData] = await Promise.all([
              supabase.from('children').select('*').eq('id', item.child_id).single(),
              supabase.from('menus').select('*').eq('id', item.menu_id).single(),
            ]);

            return {
              ...item,
              child: childData.data,
              menu: menuData.data,
            } as CartItemWithDetails;
          })
        );

        const valid = itemsWithDetails.filter(item => item.child && item.menu && !lockedItems.has(item.id));
        const expired = valid.filter(item => isPastCutoff(item.date));
        const current = valid.filter(item => !isPastCutoff(item.date));

        if (expired.length > 0) {
          const { error: removalError } = await supabase.from('cart_items').delete().in('id', expired.map(i => i.id));
          if (removalError) throw removalError;
          showAlert(
            'Panier mis à jour',
            `${expired.length} repas retiré${expired.length > 1 ? 's' : ''} du panier : la commande n'est plus possible après 7h le jour du repas.`
          );
        }
        setCartItems(current);
      } else {
        setCartItems([]);
      }

      const availableCredits = await getAvailableCredits(currentParent.id);
      setCredits(availableCredits);
    } catch (err) {
      console.error('Error loading cart:', err);
      showAlert('Panier indisponible', 'Impossible de vérifier les paiements en cours. Réessayez avant de commander.');
      setCartItems([]);
    } finally {
      setLoading(false);
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setCartItems(cartItems.filter(item => item.id !== itemId));
      showAlert('Succès', 'Article retiré du panier');
    } catch (err) {
      console.error('Error removing item:', err);
      showAlert('Suppression impossible', err instanceof Error ? err.message : String((err as any)?.message || 'Réessayez dans un instant.'));
    }
  };

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.total_price), 0),
    [cartItems]
  );

  const balance = useMemo(
    () => credits.reduce((s, c) => s + (Number(c.amount) - Number(c.used_amount) - Number(c.reserved_amount || 0)), 0),
    [credits]
  );

  const application = useMemo(
    () => applyCreditsToCart(
      useCredits ? credits : [],
      cartItems.map(item => ({ id: item.id, date: item.date, total_price: item.total_price }))
    ),
    [useCredits, credits, cartItems]
  );

  const totalAfterCredit = Math.max(0, Math.round((subtotal - application.totalDiscount) * 100) / 100);

  const handlePayment = async () => {
    if (cartItems.length === 0 || !parent || processingPaymentRef.current) return;

    processingPaymentRef.current = true;
    setProcessingPayment(true);
    let paymentOpened = false;
    try {
      // Garde-fou : si 7h est passé pour certains repas pendant que le panier était ouvert,
      // on les retire et on demande de reconfirmer (le total et les crédits changent).
      const expiredNow = cartItems.filter(item => isPastCutoff(item.date));
      if (expiredNow.length > 0) {
        const { error: removalError } = await supabase.from('cart_items').delete().in('id', expiredNow.map(i => i.id));
        if (removalError) throw removalError;
        setCartItems(prev => prev.filter(item => !isPastCutoff(item.date)));
        showAlert(
          'Panier mis à jour',
          `${expiredNow.length} repas retiré${expiredNow.length > 1 ? 's' : ''} : la commande n'est plus possible après 7h le jour du repas. Vérifiez votre panier puis relancez le paiement.`
        );
        return;
      }

      const confirmedItems = await prepareCartOrders(cartItems, parent.id, date => {
        router.push(childSelectionRoute(date));
      });
      if (!confirmedItems) return;

      const cartItemsForPayment: CartItemForPayment[] = confirmedItems.map(item => ({
        id: item.id,
        confirmed_daily_quantity: item.confirmed_daily_quantity,
        repeat_order_confirmed_at: item.repeat_order_confirmed_at,
        child_id: item.child_id,
        menu_id: item.menu_id,
        date: item.date,
        supplements: item.supplements || [],
        annotations: item.annotations,
        total_price: item.total_price,
        child: {
          first_name: item.child.first_name,
          last_name: item.child.last_name,
        },
        menu: {
          meal_name: item.menu.meal_name,
        },
      }));

      const response = await payzoneService.initializePayment(
        parent.id,
        cartItemsForPayment,
        totalAfterCredit,
        parent.email || undefined,
        `${parent.first_name} ${parent.last_name}`,
        application.creditsUsed
      );

      if (response.success && response.completed && response.orderId) {
        setCredits([]);
        setCartItems([]);
        router.replace({ pathname: '/(parent)/order-summary', params: { orderId: response.orderId } });
        return;
      }

      if (!response.success || !response.paywallUrl || !response.payload || !response.signature) {
        throw new Error(response.error || 'Erreur lors de l\'initialisation du paiement');
      }

      if (response.reused) {
        const resume = await new Promise<boolean>(resolve => showAlert(
          'Reprendre votre paiement',
          `Ce panier a déjà un paiement en cours : ${Number(response.totalAmount).toFixed(2)} DH par carte et ${Number(response.creditAmount || 0).toFixed(2)} DH de cagnotte réservée. Vous allez reprendre ce même paiement.`,
          [{ text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Reprendre', onPress: () => resolve(true) }],
          { requireExplicitChoice: true }
        ));
        if (!resume) return;
      }

      router.push({
        pathname: '/(parent)/payment',
        params: {
          paywallUrl: response.paywallUrl,
          payload: response.payload,
          signature: response.signature,
          orderId: response.orderId,
        },
      });
      paymentOpened = true;

    } catch (err) {
      console.error('Error processing payment:', err);
      showAlert(
        'Erreur',
        getPaymentErrorMessage(err, totalAfterCredit <= 0.005 && application.creditsUsed.length > 0)
      );
    } finally {
      if (!paymentOpened) {
        processingPaymentRef.current = false;
        setProcessingPayment(false);
      }
    }
  };

  const handleOpenPayment = async (payment: PendingPayment, resume: boolean) => {
    if (!parent || checkingOrder || processingPaymentRef.current) return;
    setCheckingOrder(payment.order_id);
    try {
      const result = await payzoneService.reconcilePayment(payment.order_id);
      if (result.payment.status === 'completed') {
        router.replace({ pathname: '/(parent)/order-summary', params: { orderId: payment.order_id } });
        return;
      }
      if (result.payment.released_at) {
        showAlert('Paiement non abouti confirmé', 'Les repas et le crédit réservé sont débloqués. Vérifiez le panier avant de passer une nouvelle commande.');
        await loadCartData();
        return;
      }
      if (!resume) {
        showAlert('Suivi du paiement', result.message || 'Ce paiement nécessite encore une vérification. Conservez sa référence et contactez le support avant de payer à nouveau.');
        await loadCartData();
        return;
      }
      const response = await payzoneService.resumePayment(parent.id, payment.order_id);
      if (!response.success || !response.paywallUrl || !response.payload || !response.signature) {
        throw new Error(response.error || 'Reprise du paiement indisponible.');
      }
      router.push({ pathname: '/(parent)/payment', params: {
        paywallUrl: response.paywallUrl, payload: response.payload, signature: response.signature, orderId: payment.order_id,
      } });
    } catch (error) {
      showAlert('Paiement à vérifier', (error as Error).message);
    } finally { setCheckingOrder(null); }
  };


  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0E5FC0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topSection}>
        <TouchableOpacity onPress={() => safeBack('/(parent)')} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <ShoppingCart size={20} color="#FFFFFF" />
          <Text style={styles.badgeText}>Mon Panier</Text>
        </View>
      </View>

      {openPayments.length > 0 && (
        <ScrollView style={{ maxHeight: 245, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: '#111827', marginBottom: 8 }}>Paiements à terminer ou à vérifier</Text>
          {openPayments.map(payment => (
            <View key={payment.order_id} style={{ backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#111827' }}>{payment.cart_items.length} repas · {Number(payment.total_amount).toFixed(2)} DH par carte</Text>
              <Text style={{ color: '#4B5563', marginVertical: 4 }}>
                {payment.cart_items.map(item => `${item.child?.first_name || 'Enfant'} · ${item.date}`).join(', ')}
              </Text>
              <Text style={{ color: '#4B5563' }}>{payment.applied_credits.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2)} DH de cagnotte dans cette commande</Text>
              <Text selectable style={{ color: '#6B7280', fontSize: 11, marginVertical: 4 }}>Réf. {payment.order_id}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {payment.checkout_key && !payment.cart_items.some(item => isPastCutoff(item.date)) && (
                  <TouchableOpacity disabled={!!checkingOrder || processingPayment} onPress={() => handleOpenPayment(payment, true)} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ color: '#0E5FC0', fontWeight: '700' }}>Reprendre ce paiement</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity disabled={!!checkingOrder || processingPayment} onPress={() => handleOpenPayment(payment, false)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: '#0E5FC0', fontWeight: '700' }}>{checkingOrder === payment.order_id ? 'Vérification…' : 'Vérifier le résultat'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShoppingCart size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Votre panier est vide</Text>
          <Text style={styles.emptyText}>Ajoutez des repas pour commencer</Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => safeBack('/(parent)')}
          >
            <Text style={styles.browseButtonText}>Parcourir les menus</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {Object.entries(
              cartItems.reduce((groups, item) => {
                const key = item.child_id;
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
                return groups;
              }, {} as Record<string, CartItemWithDetails[]>)
            ).map(([childId, items]) => {
              const child = items[0].child;
              const childTotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
              return (
                <View key={childId} style={styles.childSection}>
                  <View style={styles.childSectionHeader}>
                    <View style={styles.childAvatar}>
                      <User size={20} color="#0E5FC0" />
                    </View>
                    <View style={styles.childSectionInfo}>
                      <Text style={styles.childSectionName}>
                        {child.first_name} {child.last_name}
                      </Text>
                      <Text style={styles.childSectionCount}>
                        {items.length} repas — {childTotal.toFixed(2)} DH
                      </Text>
                    </View>
                  </View>

                  {items.map((item) => (
                    <View key={item.id} style={styles.cartItem}>
                      <View style={styles.itemHeader}>
                        <Text style={styles.menuName}>{item.menu.meal_name}</Text>
                        <TouchableOpacity
                          onPress={() => removeFromCart(item.id)}
                          disabled={processingPayment}
                          style={styles.deleteButton}
                        >
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.menuDate}>
                        {new Date(item.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </Text>

                      {item.menu.description && (
                        <Text style={styles.menuDescription}>{item.menu.description}</Text>
                      )}

                      {item.supplements && item.supplements.length > 0 && (
                        <View style={styles.supplementsContainer}>
                          <Text style={styles.supplementsLabel}>Suppléments :</Text>
                          {item.supplements.map((supp: any, idx: number) => (
                            <Text key={idx} style={styles.supplementItem}>
                              • {supp.name} (+{Number(supp.price).toFixed(2)} DH)
                            </Text>
                          ))}
                        </View>
                      )}

                      {item.annotations && (
                        <View style={styles.annotationsContainer}>
                          <Text style={styles.annotationsLabel}>Note :</Text>
                          <Text style={styles.annotationsText}>{item.annotations}</Text>
                        </View>
                      )}

                      <View style={styles.itemFooter}>
                        <Text style={styles.itemPrice}>{Number(item.total_price).toFixed(2)} DH</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            {balance > 0 && (
              <View style={styles.cagnotteCard}>
                <View style={styles.cagnotteLeft}>
                  <View style={styles.cagnotteIconWrap}>
                    <Wallet size={20} color="#0E5FC0" />
                  </View>
                  <View style={styles.cagnotteInfo}>
                    <Text style={styles.cagnotteTitle}>Ma cagnotte</Text>
                    <Text style={styles.cagnotteAmount}>{balance.toFixed(2)} DH disponible</Text>
                    {useCredits && application.totalDiscount > 0 ? (
                      <Text style={styles.cagnotteApplied}>
                        −{application.totalDiscount.toFixed(2)} DH appliqués
                      </Text>
                    ) : useCredits && application.totalDiscount === 0 ? (
                      <Text style={styles.cagnotteHint}>Ajoutez un repas pour l'utiliser</Text>
                    ) : null}
                  </View>
                </View>
                <Switch
                  value={useCredits}
                  onValueChange={setUseCredits}
                  disabled={processingPayment}
                  trackColor={{ false: '#E5E7EB', true: '#CFE4F7' }}
                  thumbColor={useCredits ? '#0E5FC0' : '#F4F6FB'}
                />
              </View>
            )}

            <View style={styles.totalContainer}>
              {application.totalDiscount > 0 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Sous-total</Text>
                  <Text style={styles.subtotalValue}>{subtotal.toFixed(2)} DH</Text>
                </View>
              )}
              {application.totalDiscount > 0 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.discountLabel}>Crédit cagnotte</Text>
                  <Text style={styles.discountValue}>−{application.totalDiscount.toFixed(2)} DH</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total à payer</Text>
                <Text style={styles.totalAmount}>{totalAfterCredit.toFixed(2)} DH</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.payButton, (processingPayment || !!checkingOrder) && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={processingPayment || !!checkingOrder}
            >
              {processingPayment ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : totalAfterCredit <= 0.005 && application.totalDiscount > 0 ? (
                <>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.payButtonText}>Confirmer la commande</Text>
                </>
              ) : (
                <>
                  <Lock size={18} color="#FFFFFF" />
                  <Text style={styles.payButtonText}>Payer par carte bancaire</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.securePaymentNote}>
              <Text style={styles.securePaymentText}>
                {totalAfterCredit <= 0.005 && application.totalDiscount > 0
                  ? 'Aucun paiement requis — cagnotte suffisante'
                  : 'Paiement sécurisé par PayZone'}
              </Text>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#F4F6FB',
  },
  backButton: {
    padding: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E5FC0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignSelf: 'flex-start',
    gap: 8,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: '#0E5FC0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  childSection: {
    marginBottom: 20,
  },
  childSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#0E5FC0',
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAF4FC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childSectionInfo: {
    flex: 1,
  },
  childSectionName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  childSectionCount: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  cartItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteButton: {
    padding: 4,
  },
  itemDetails: {
    marginBottom: 12,
  },
  menuName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  menuDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  supplementsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  supplementsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  supplementItem: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  annotationsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  annotationsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  annotationsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  itemFooter: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 8,
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 0,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  totalContainer: {
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  subtotalLabel: { fontSize: 14, color: '#6B7280' },
  subtotalValue: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  discountLabel: { fontSize: 14, color: '#0E5FC0', fontWeight: '600' },
  discountValue: { fontSize: 14, color: '#0E5FC0', fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 8,
  },
  cagnotteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#EAF4FC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CFE4F7',
  },
  cagnotteLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cagnotteIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
  cagnotteInfo: { flex: 1 },
  cagnotteTitle: { fontSize: 13, fontWeight: '700', color: '#0E5FC0' },
  cagnotteAmount: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cagnotteApplied: { fontSize: 12, color: '#10B981', fontWeight: '700', marginTop: 2 },
  cagnotteHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' },
  testButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 0,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  payButton: {
    backgroundColor: '#0E5FC0',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  securePaymentNote: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  securePaymentText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
